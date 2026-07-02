mod connections;
mod database;
mod types;

use serde_json::Value;
use tauri::{AppHandle, State};
use tokio::sync::Mutex;

use database::DatabaseManager;
use types::{
    ApiResponse, ConnectionConfig, ConnectionInput, ExportOptions, SampleData, SavedConnection,
    TableInfo,
};

#[derive(Default)]
struct AppState {
    database: Mutex<DatabaseManager>,
}

#[tauri::command]
async fn connect(state: State<'_, AppState>, config: ConnectionConfig) -> Result<ApiResponse<()>, String> {
    let mut database = state.database.lock().await;
    Ok(match database.connect(config).await {
        Ok(()) => ApiResponse::empty(),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn disconnect(state: State<'_, AppState>) -> Result<ApiResponse<()>, String> {
    let mut database = state.database.lock().await;
    Ok(match database.disconnect().await {
        Ok(()) => ApiResponse::empty(),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn get_databases(state: State<'_, AppState>) -> Result<ApiResponse<Vec<String>>, String> {
    let mut database = state.database.lock().await;
    Ok(match database.get_databases().await {
        Ok(databases) => ApiResponse::ok(databases),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn get_tables(
    state: State<'_, AppState>,
    database: String,
) -> Result<ApiResponse<Vec<TableInfo>>, String> {
    let mut manager = state.database.lock().await;
    Ok(match manager.get_tables(database).await {
        Ok(tables) => ApiResponse::ok(tables),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn get_table_structure(
    state: State<'_, AppState>,
    database: String,
    table: String,
) -> Result<ApiResponse<Vec<Value>>, String> {
    let mut manager = state.database.lock().await;
    Ok(match manager.get_table_structure(database, table).await {
        Ok(structure) => ApiResponse::ok(structure),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn get_sample_data(
    state: State<'_, AppState>,
    database: String,
    table: String,
    limit: u32,
) -> Result<ApiResponse<SampleData>, String> {
    let mut manager = state.database.lock().await;
    Ok(match manager.get_sample_data(database, table, limit).await {
        Ok(sample) => ApiResponse::ok(sample),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn get_create_table(
    state: State<'_, AppState>,
    database: String,
    table: String,
) -> Result<ApiResponse<String>, String> {
    let mut manager = state.database.lock().await;
    Ok(match manager.get_create_table_sql(database, table).await {
        Ok(sql) => ApiResponse::ok(sql),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
async fn export_data(
    state: State<'_, AppState>,
    options: ExportOptions,
) -> Result<ApiResponse<()>, String> {
    let mut manager = state.database.lock().await;
    Ok(match manager.export_data(options).await {
        Ok(()) => ApiResponse::empty(),
        Err(error) => ApiResponse::err(error),
    })
}

#[tauri::command]
fn list_connections(app: AppHandle) -> ApiResponse<Vec<SavedConnection>> {
    match connections::list_connections(&app) {
        Ok(items) => ApiResponse::ok(items),
        Err(error) => ApiResponse::err(error),
    }
}

#[tauri::command]
fn save_connection(app: AppHandle, item: ConnectionInput) -> ApiResponse<SavedConnection> {
    match connections::save_connection(&app, item) {
        Ok(saved) => ApiResponse::ok(saved),
        Err(error) => ApiResponse::err(error),
    }
}

#[tauri::command]
fn delete_connection(app: AppHandle, id: String) -> ApiResponse<bool> {
    match connections::delete_connection(&app, &id) {
        Ok(deleted) => ApiResponse::ok(deleted),
        Err(error) => ApiResponse::err(error),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            connect,
            disconnect,
            get_databases,
            get_tables,
            get_table_structure,
            get_sample_data,
            get_create_table,
            export_data,
            list_connections,
            save_connection,
            delete_connection
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
