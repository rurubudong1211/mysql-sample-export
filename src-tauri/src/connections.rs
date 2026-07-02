use std::{fs, path::PathBuf};

use base64::{engine::general_purpose, Engine as _};
use tauri::AppHandle;
use uuid::Uuid;

use crate::types::{ConnectionInput, SavedConnection, StoredConnection};

fn connections_file(_app: &AppHandle) -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|err| err.to_string())?;
    let dir = exe_path
        .parent()
        .ok_or_else(|| "Failed to resolve executable directory".to_string())?;
    Ok(dir.join("connections.json"))
}

fn encode_password(password: &str) -> String {
    general_purpose::STANDARD.encode(password.as_bytes())
}

fn decode_password(password: &str) -> String {
    general_purpose::STANDARD
        .decode(password)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or_default()
}

fn load_all(app: &AppHandle) -> Result<Vec<StoredConnection>, String> {
    let path = connections_file(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let raw = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&raw).map_err(|err| err.to_string())
}

fn save_all(app: &AppHandle, connections: &[StoredConnection]) -> Result<(), String> {
    let path = connections_file(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }

    let content = serde_json::to_string_pretty(connections).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

fn to_saved(connection: StoredConnection) -> SavedConnection {
    SavedConnection {
        id: connection.id,
        name: connection.name,
        host: connection.host,
        port: connection.port,
        user: connection.user,
        password: decode_password(&connection.password_encrypted),
        ssl: connection.ssl,
    }
}

pub fn list_connections(app: &AppHandle) -> Result<Vec<SavedConnection>, String> {
    load_all(app).map(|items| items.into_iter().map(to_saved).collect())
}

pub fn save_connection(app: &AppHandle, item: ConnectionInput) -> Result<SavedConnection, String> {
    let mut all = load_all(app)?;
    let id = item
        .id
        .as_deref()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let stored = StoredConnection {
        id: id.clone(),
        name: item.name.trim().to_string(),
        host: item.host.trim().to_string(),
        port: item.port,
        user: item.user.trim().to_string(),
        password_encrypted: encode_password(&item.password),
        ssl: item.ssl,
    };

    if let Some(index) = all.iter().position(|connection| connection.id == id) {
        all[index] = stored;
    } else {
        all.push(stored);
    }

    save_all(app, &all)?;

    Ok(SavedConnection {
        id,
        name: item.name,
        host: item.host,
        port: item.port,
        user: item.user,
        password: item.password,
        ssl: item.ssl,
    })
}

pub fn delete_connection(app: &AppHandle, id: &str) -> Result<bool, String> {
    let mut all = load_all(app)?;
    let before = all.len();
    all.retain(|connection| connection.id != id);
    let deleted = all.len() != before;
    if deleted {
        save_all(app, &all)?;
    }
    Ok(deleted)
}
