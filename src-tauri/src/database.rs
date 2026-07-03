use mysql_async::{prelude::Queryable, Conn, OptsBuilder, Row, SslOpts, Value as MySqlValue};
use serde_json::{json, Map, Number, Value};

use crate::types::{
    ConnectionConfig, ExportFormat, ExportOptions, ExportTableData, SampleData, TableInfo,
};

const SYSTEM_DATABASES: &[&str] = &["information_schema", "performance_schema", "mysql", "sys"];

#[derive(Default)]
pub struct DatabaseManager {
    connection: Option<Conn>,
}

impl DatabaseManager {
    pub async fn connect(&mut self, config: ConnectionConfig) -> Result<(), String> {
        self.disconnect().await?;

        let mut opts = OptsBuilder::default()
            .ip_or_hostname(config.host.trim().to_string())
            .tcp_port(config.port)
            .user(Some(config.user.trim().to_string()))
            .pass(Some(config.password))
            .prefer_socket(Some(false))
            .stmt_cache_size(Some(0));

        if config.ssl.unwrap_or(false) {
            let ssl_opts = SslOpts::default()
                .with_danger_skip_domain_validation(true)
                .with_danger_accept_invalid_certs(true);
            opts = opts.ssl_opts(Some(ssl_opts));
        }

        let connection = Conn::new(opts).await.map_err(|err| err.to_string())?;
        self.connection = Some(connection);
        Ok(())
    }

    pub async fn disconnect(&mut self) -> Result<(), String> {
        if let Some(connection) = self.connection.take() {
            connection.disconnect().await.map_err(|err| err.to_string())?;
        }
        Ok(())
    }

    pub async fn get_databases(&mut self) -> Result<Vec<String>, String> {
        let rows: Vec<Row> = self.conn()?.query("SHOW DATABASES").await.map_err(|err| err.to_string())?;
        Ok(rows
            .iter()
            .filter_map(|row| row.as_ref(0).map(value_to_plain_string))
            .filter(|name| !SYSTEM_DATABASES.contains(&name.as_str()))
            .collect())
    }

    pub async fn get_tables(&mut self, database: String) -> Result<Vec<TableInfo>, String> {
        let rows: Vec<Row> = self
            .conn()?
            .exec(
                r#"SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_ROWS AS `rows`
                   FROM information_schema.TABLES
                   WHERE TABLE_SCHEMA = ?
                   ORDER BY TABLE_NAME"#,
                (database,),
            )
            .await
            .map_err(|err| err.to_string())?;

        Ok(rows
            .iter()
            .map(|row| {
                let object = row_to_object(row);
                let table_type = object_get_string(&object, "type");
                TableInfo {
                    name: object_get_string(&object, "name"),
                    object_type: if table_type == "VIEW" { "VIEW".to_string() } else { "TABLE".to_string() },
                    rows: object_get_u64(&object, "rows"),
                }
            })
            .collect())
    }

    pub async fn get_table_structure(&mut self, database: String, table: String) -> Result<Vec<Value>, String> {
        let query = format!(
            "SHOW FULL COLUMNS FROM {}.{}",
            quote_identifier(&database),
            quote_identifier(&table)
        );
        let rows: Vec<Row> = self.conn()?.query(query).await.map_err(|err| err.to_string())?;
        Ok(rows.into_iter().map(|row| Value::Object(row_to_object(&row))).collect())
    }

    pub async fn get_sample_data(
        &mut self,
        database: String,
        table: String,
        limit: u32,
    ) -> Result<SampleData, String> {
        let safe_limit = sanitize_limit(limit);
        let query = format!(
            "SELECT * FROM {}.{} LIMIT {}",
            quote_identifier(&database),
            quote_identifier(&table),
            safe_limit
        );

        let rows: Vec<Row> = self.conn()?.query(query).await.map_err(|err| err.to_string())?;
        if rows.is_empty() {
            return Ok(SampleData { columns: Vec::new(), rows: Vec::new() });
        }

        let columns: Vec<String> = rows[0]
            .columns_ref()
            .iter()
            .map(|column| column.name_str().to_string())
            .collect();
        let data_rows = rows
            .iter()
            .map(|row| {
                (0..columns.len())
                    .map(|index| row.as_ref(index).map(value_to_json).unwrap_or(Value::Null))
                    .collect()
            })
            .collect();

        Ok(SampleData { columns, rows: data_rows })
    }

    pub async fn get_create_table_sql(&mut self, database: String, table: String) -> Result<String, String> {
        let query = format!(
            "SHOW CREATE TABLE {}.{}",
            quote_identifier(&database),
            quote_identifier(&table)
        );
        let rows: Vec<Row> = self.conn()?.query(query).await.map_err(|err| err.to_string())?;
        let Some(row) = rows.first() else {
            return Ok(String::new());
        };

        let object = row_to_object(row);
        Ok(object_get_string_opt(&object, "Create Table")
            .or_else(|| object_get_string_opt(&object, "Create View"))
            .unwrap_or_default())
    }

    pub async fn export_data(&mut self, options: ExportOptions) -> Result<(), String> {
        let table_names = normalize_export_tables(&options)?;
        let mut export_tables = Vec::with_capacity(table_names.len());

        for table_name in table_names {
            export_tables.push(self.get_export_table_data(&options.database, &table_name, options.sample_limit).await?);
        }

        let export_time = time::OffsetDateTime::now_utc();
        let default_export_time = format_rfc3339_export_time(export_time);
        let sql_export_time = format_sql_export_time(export_time);
        let content = if export_tables.len() == 1 {
            let table_data = &export_tables[0];
            match options.format {
                ExportFormat::Sql => generate_sql_export(&options.database, table_data, &sql_export_time),
                ExportFormat::Json => generate_json_export(&options.database, table_data, &default_export_time)?,
                ExportFormat::Csv => generate_csv_export(&table_data.sample),
                ExportFormat::Markdown => generate_markdown_export(&options.database, table_data, &default_export_time),
            }
        } else {
            match options.format {
                ExportFormat::Sql => generate_multi_sql_export(&options.database, &export_tables, &sql_export_time),
                ExportFormat::Json => generate_multi_json_export(&options.database, &export_tables, &default_export_time, options.sample_limit)?,
                ExportFormat::Csv => generate_multi_csv_export(&options.database, &export_tables),
                ExportFormat::Markdown => generate_multi_markdown_export(&options.database, &export_tables, &default_export_time, options.sample_limit),
            }
        };

        tokio::fs::write(options.file_path, content)
            .await
            .map_err(|err| err.to_string())
    }

    async fn get_export_table_data(
        &mut self,
        database: &str,
        table: &str,
        sample_limit: u32,
    ) -> Result<ExportTableData, String> {
        let create_sql = self.get_create_table_sql(database.to_string(), table.to_string()).await?;
        let structure = self.get_table_structure(database.to_string(), table.to_string()).await?;
        let sample = self.get_sample_data(database.to_string(), table.to_string(), sample_limit).await?;
        Ok(ExportTableData {
            name: table.to_string(),
            create_sql,
            structure,
            sample,
        })
    }

    fn conn(&mut self) -> Result<&mut Conn, String> {
        self.connection
            .as_mut()
            .ok_or_else(|| "未连接到数据库，请先连接".to_string())
    }
}

fn quote_identifier(value: &str) -> String {
    format!("`{}`", value.replace('`', "``"))
}

fn sanitize_limit(limit: u32) -> u32 {
    limit.clamp(1, 1000)
}

fn normalize_export_tables(options: &ExportOptions) -> Result<Vec<String>, String> {
    let mut names = Vec::new();
    if let Some(tables) = &options.tables {
        names.extend(tables.iter().cloned());
    } else if let Some(table) = &options.table {
        names.push(table.clone());
    }

    let mut unique = Vec::new();
    for name in names {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed == "undefined" || trimmed == "null" {
            continue;
        }
        if !unique.iter().any(|item: &String| item == trimmed) {
            unique.push(trimmed.to_string());
        }
    }

    if unique.is_empty() {
        Err("请选择要导出的表".to_string())
    } else {
        Ok(unique)
    }
}

fn row_to_object(row: &Row) -> Map<String, Value> {
    let mut object = Map::new();
    for (index, column) in row.columns_ref().iter().enumerate() {
        let value = row.as_ref(index).map(value_to_json).unwrap_or(Value::Null);
        object.insert(column.name_str().to_string(), value);
    }
    object
}

fn value_to_json(value: &MySqlValue) -> Value {
    match value {
        MySqlValue::NULL => Value::Null,
        MySqlValue::Bytes(bytes) => Value::String(bytes_to_string(bytes)),
        MySqlValue::Int(value) => Value::Number(Number::from(*value)),
        MySqlValue::UInt(value) => Value::Number(Number::from(*value)),
        MySqlValue::Float(value) => Number::from_f64(*value as f64).map(Value::Number).unwrap_or(Value::Null),
        MySqlValue::Double(value) => Number::from_f64(*value).map(Value::Number).unwrap_or(Value::Null),
        MySqlValue::Date(year, month, day, hour, minute, second, micros) => {
            if *hour == 0 && *minute == 0 && *second == 0 && *micros == 0 {
                Value::String(format!("{year:04}-{month:02}-{day:02}"))
            } else if *micros == 0 {
                Value::String(format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}"))
            } else {
                Value::String(format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{micros:06}"))
            }
        }
        MySqlValue::Time(negative, days, hours, minutes, seconds, micros) => {
            let sign = if *negative { "-" } else { "" };
            let total_hours = days * 24 + u32::from(*hours);
            if *micros == 0 {
                Value::String(format!("{sign}{total_hours:02}:{minutes:02}:{seconds:02}"))
            } else {
                Value::String(format!("{sign}{total_hours:02}:{minutes:02}:{seconds:02}.{micros:06}"))
            }
        }
    }
}

fn value_to_plain_string(value: &MySqlValue) -> String {
    match value_to_json(value) {
        Value::Null => String::new(),
        Value::String(value) => value,
        other => other.to_string(),
    }
}

fn bytes_to_string(bytes: &[u8]) -> String {
    String::from_utf8(bytes.to_vec()).unwrap_or_else(|_| format!("0x{}", to_hex(bytes)))
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn object_get_string(object: &Map<String, Value>, key: &str) -> String {
    object_get_string_opt(object, key).unwrap_or_default()
}

fn object_get_string_opt(object: &Map<String, Value>, key: &str) -> Option<String> {
    object.get(key).and_then(|value| match value {
        Value::Null => None,
        Value::String(value) => Some(value.clone()),
        other => Some(other.to_string()),
    })
}

fn object_get_u64(object: &Map<String, Value>, key: &str) -> u64 {
    object
        .get(key)
        .and_then(|value| match value {
            Value::Number(number) => number.as_u64(),
            Value::String(value) => value.parse::<u64>().ok(),
            _ => None,
        })
        .unwrap_or(0)
}

fn format_rfc3339_export_time(export_time: time::OffsetDateTime) -> String {
    export_time
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn format_sql_export_time(export_time: time::OffsetDateTime) -> String {
    let export_time = export_time.to_offset(
        time::UtcOffset::from_hms(8, 0, 0).expect("valid UTC+8 offset"),
    );

    format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
        export_time.year(),
        u8::from(export_time.month()),
        export_time.day(),
        export_time.hour(),
        export_time.minute(),
        export_time.second()
    )

}
fn generate_sql_export(database: &str, table_data: &ExportTableData, export_time: &str) -> String {
    let mut lines = Vec::new();
    lines.push("-- ============================================".to_string());
    lines.push(format!("-- Database: {database}"));
    lines.push(format!("-- Table: {}", table_data.name));
    lines.push(format!("-- Export Time: {export_time}"));
    lines.push("-- Export By: MySQL Sample Export".to_string());
    lines.push("-- ============================================".to_string());
    append_sql_table_export(&mut lines, table_data, false);
    lines.join("\n")
}

fn generate_multi_sql_export(database: &str, tables: &[ExportTableData], export_time: &str) -> String {
    let mut lines = Vec::new();
    lines.push("-- ============================================".to_string());
    lines.push(format!("-- Database: {database}"));
    lines.push(format!("-- Tables: {}", tables.iter().map(|table| table.name.as_str()).collect::<Vec<_>>().join(", ")));
    lines.push(format!("-- Table Count: {}", tables.len()));
    lines.push(format!("-- Export Time: {export_time}"));
    lines.push("-- Export By: MySQL Sample Export".to_string());
    lines.push("-- ============================================".to_string());
    lines.push(String::new());
    lines.push(format!("USE {};", quote_identifier(database)));

    for table_data in tables {
        lines.push(String::new());
        append_sql_table_export(&mut lines, table_data, true);
    }

    lines.join("\n")
}

fn append_sql_table_export(lines: &mut Vec<String>, table_data: &ExportTableData, include_table_header: bool) {
    if include_table_header {
        lines.push("-- --------------------------------------------".to_string());
        lines.push(format!("-- Table: {}", table_data.name));
        lines.push("-- --------------------------------------------".to_string());
        lines.push(String::new());
    }

    lines.push("-- 表结构".to_string());
    if table_data.create_sql.trim().is_empty() {
        lines.push("-- 未能获取建表语句".to_string());
    } else {
        lines.push(format!("{};", table_data.create_sql.trim_end_matches(';')));
    }
    lines.push(String::new());

    if table_data.sample.rows.is_empty() {
        lines.push("-- 无样例数据".to_string());
        return;
    }

    lines.push(format!("-- 样例数据 (前 {} 条)", table_data.sample.rows.len()));
    let columns = table_data
        .sample
        .columns
        .iter()
        .map(|column| quote_identifier(column))
        .collect::<Vec<_>>()
        .join(", ");

    for row in &table_data.sample.rows {
        let values = row.iter().map(format_sql_value).collect::<Vec<_>>().join(", ");
        lines.push(format!(
            "INSERT INTO {} ({columns}) VALUES ({values});",
            quote_identifier(&table_data.name)
        ));
    }
}

fn format_sql_value(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::Bool(value) => if *value { "1" } else { "0" }.to_string(),
        Value::Number(number) => number.to_string(),
        Value::String(value) => format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'").replace('\r', "\\r").replace('\n', "\\n")),
        Value::Array(_) | Value::Object(_) => format!("'{}'", value.to_string().replace('\\', "\\\\").replace('\'', "\\'")),
    }
}

fn generate_json_export(database: &str, table_data: &ExportTableData, export_time: &str) -> Result<String, String> {
    serde_json::to_string_pretty(&format_json_table_export(database, table_data, export_time))
        .map_err(|err| err.to_string())
}

fn generate_multi_json_export(
    database: &str,
    tables: &[ExportTableData],
    export_time: &str,
    sample_limit: u32,
) -> Result<String, String> {
    let export = json!({
        "database": database,
        "exportTime": export_time,
        "sampleLimit": sanitize_limit(sample_limit),
        "tableCount": tables.len(),
        "tables": tables.iter().map(|table| format_json_table_export(database, table, export_time)).collect::<Vec<_>>(),
    });

    serde_json::to_string_pretty(&export).map_err(|err| err.to_string())
}

fn format_json_table_export(database: &str, table_data: &ExportTableData, export_time: &str) -> Value {
    let data_rows = table_data
        .sample
        .rows
        .iter()
        .map(|row| {
            let mut object = Map::new();
            for (index, column) in table_data.sample.columns.iter().enumerate() {
                object.insert(column.clone(), row.get(index).cloned().unwrap_or(Value::Null));
            }
            Value::Object(object)
        })
        .collect::<Vec<_>>();

    let structure = table_data
        .structure
        .iter()
        .map(|column| {
            let object = column.as_object();
            json!({
                "field": object.and_then(|obj| obj.get("Field")).cloned().unwrap_or(Value::Null),
                "type": object.and_then(|obj| obj.get("Type")).cloned().unwrap_or(Value::Null),
                "nullable": object.and_then(|obj| obj.get("Null")).and_then(Value::as_str) == Some("YES"),
                "key": object.and_then(|obj| obj.get("Key")).cloned().unwrap_or(Value::Null),
                "default": object.and_then(|obj| obj.get("Default")).cloned().unwrap_or(Value::Null),
                "extra": object.and_then(|obj| obj.get("Extra")).cloned().unwrap_or(Value::Null),
                "comment": object.and_then(|obj| obj.get("Comment")).cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();

    json!({
        "database": database,
        "table": table_data.name,
        "exportTime": export_time,
        "structure": structure,
        "sampleData": data_rows,
        "sampleCount": data_rows.len(),
    })
}

fn generate_csv_export(sample: &SampleData) -> String {
    let mut lines = Vec::new();
    lines.push(sample.columns.iter().map(|column| escape_csv(column)).collect::<Vec<_>>().join(","));
    for row in &sample.rows {
        lines.push(row.iter().map(escape_csv_value).collect::<Vec<_>>().join(","));
    }
    lines.join("\n")
}

fn generate_multi_csv_export(database: &str, tables: &[ExportTableData]) -> String {
    let mut lines = Vec::new();
    for (index, table_data) in tables.iter().enumerate() {
        if index > 0 {
            lines.push(String::new());
        }
        lines.push([escape_csv("Table"), escape_csv(&format!("{database}.{}", table_data.name))].join(","));
        lines.push(table_data.sample.columns.iter().map(|column| escape_csv(column)).collect::<Vec<_>>().join(","));
        for row in &table_data.sample.rows {
            lines.push(row.iter().map(escape_csv_value).collect::<Vec<_>>().join(","));
        }
        if table_data.sample.rows.is_empty() {
            lines.push(escape_csv("(无样例数据)"));
        }
    }
    lines.join("\n")
}

fn escape_csv_value(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::String(value) => escape_csv(value),
        other => escape_csv(&other.to_string()),
    }
}

fn escape_csv(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

fn generate_markdown_export(database: &str, table_data: &ExportTableData, export_time: &str) -> String {
    let mut lines = Vec::new();
    lines.push(format!("# {database}.{}", table_data.name));
    lines.push(String::new());
    lines.push(format!("> 导出时间: {export_time}"));
    lines.push(String::new());
    append_markdown_table_export(&mut lines, table_data);
    lines.join("\n")
}

fn generate_multi_markdown_export(
    database: &str,
    tables: &[ExportTableData],
    export_time: &str,
    sample_limit: u32,
) -> String {
    let mut lines = Vec::new();
    lines.push(format!("# {database} 多表导出"));
    lines.push(String::new());
    lines.push(format!("> 导出时间: {export_time}"));
    lines.push(format!("> 表数量: {}", tables.len()));
    lines.push(format!("> 样例行数: {}", sanitize_limit(sample_limit)));

    for table_data in tables {
        lines.push(String::new());
        lines.push("---".to_string());
        lines.push(String::new());
        lines.push(format!("# {database}.{}", table_data.name));
        lines.push(String::new());
        append_markdown_table_export(&mut lines, table_data);
    }

    lines.join("\n")
}

fn append_markdown_table_export(lines: &mut Vec<String>, table_data: &ExportTableData) {
    lines.push("## 表结构".to_string());
    lines.push(String::new());
    lines.push("| 字段 | 类型 | 允许为空 | 键 | 默认值 | 额外 | 注释 |".to_string());
    lines.push("|------|------|---------|-----|--------|------|------|".to_string());

    for column in &table_data.structure {
        let object = column.as_object();
        let field = object.and_then(|obj| obj.get("Field")).map(markdown_value).unwrap_or_default();
        let column_type = object.and_then(|obj| obj.get("Type")).map(markdown_value).unwrap_or_default();
        let nullable = object.and_then(|obj| obj.get("Null")).and_then(Value::as_str).unwrap_or("NO");
        let key = object.and_then(|obj| obj.get("Key")).map(markdown_value).filter(|value| !value.is_empty()).unwrap_or_else(|| "-".to_string());
        let default = object.and_then(|obj| obj.get("Default")).map(markdown_value).unwrap_or_else(|| "NULL".to_string());
        let extra = object.and_then(|obj| obj.get("Extra")).map(markdown_value).filter(|value| !value.is_empty()).unwrap_or_else(|| "-".to_string());
        let comment = object.and_then(|obj| obj.get("Comment")).map(markdown_value).filter(|value| !value.is_empty()).unwrap_or_else(|| "-".to_string());

        lines.push(format!(
            "| {} | {} | {} | {} | {} | {} | {} |",
            escape_markdown_cell(&field),
            escape_markdown_cell(&column_type),
            nullable,
            escape_markdown_cell(&key),
            escape_markdown_cell(&default),
            escape_markdown_cell(&extra),
            escape_markdown_cell(&comment)
        ));
    }

    lines.push(String::new());
    lines.push(format!("## 样例数据 (前 {} 条)", table_data.sample.rows.len()));
    lines.push(String::new());

    if table_data.sample.columns.is_empty() || table_data.sample.rows.is_empty() {
        lines.push("*(无数据)*".to_string());
        return;
    }

    lines.push(format!(
        "| {} |",
        table_data.sample.columns.iter().map(|column| escape_markdown_cell(column)).collect::<Vec<_>>().join(" | ")
    ));
    lines.push(format!("| {} |", table_data.sample.columns.iter().map(|_| "---").collect::<Vec<_>>().join(" | ")));

    for row in &table_data.sample.rows {
        lines.push(format!(
            "| {} |",
            row.iter().map(|value| escape_markdown_cell(&markdown_value(value))).collect::<Vec<_>>().join(" | ")
        ));
    }
}

fn markdown_value(value: &Value) -> String {
    match value {
        Value::Null => "NULL".to_string(),
        Value::String(value) => value.clone(),
        other => other.to_string(),
    }
}

fn escape_markdown_cell(value: &str) -> String {
    value.replace('|', "\\|").replace("\r\n", "<br>").replace('\n', "<br>").replace('\r', "<br>")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_data() -> ExportTableData {
        ExportTableData {
            name: "disaster_info".to_string(),
            create_sql: "CREATE TABLE `disaster_info` (`id` int)".to_string(),
            structure: Vec::new(),
            sample: SampleData {
                columns: vec!["id".to_string()],
                rows: vec![vec![serde_json::json!(1)]],
            },
        }
    }

    #[test]
    fn format_sql_export_time_uses_utc_plus_8_timestamp() {
        let export_time = time::Date::from_calendar_date(2026, time::Month::July, 2)
            .unwrap()
            .with_hms(8, 5, 2)
            .unwrap()
            .assume_utc();

        assert_eq!(format_sql_export_time(export_time), "2026-07-02 16:05:02");
    }

    #[test]
    fn generate_sql_export_uses_simplified_header() {
        let sql = generate_sql_export("tem_platform", &table_data(), "2026-07-02 08:05:02");
        let expected_header = concat!(
            "-- ============================================\n",
            "-- Database: tem_platform\n",
            "-- Table: disaster_info\n",
            "-- Export Time: 2026-07-02 08:05:02\n",
            "-- Export By: MySQL Sample Export\n",
            "-- ============================================\n",
        );

        assert!(sql.starts_with(expected_header));
        assert!(!sql.contains("USE `tem_platform`;"));
        assert!(!sql.contains("-- --------------------------------------------"));
        assert!(sql.contains("INSERT INTO `disaster_info` (`id`) VALUES (1);"));
    }
}
