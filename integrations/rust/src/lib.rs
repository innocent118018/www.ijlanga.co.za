use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub ok: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

pub struct IjLangaClient {
    base_url: String,
    client: reqwest::Client,
}

impl IjLangaClient {
    pub fn new(base_url: impl Into<String>) -> Self {
        Self { base_url: base_url.into(), client: reqwest::Client::new() }
    }

    pub async fn health(&self) -> Result<ApiResponse<serde_json::Value>, reqwest::Error> {
        self.client.get(format!("{}/api/health", self.base_url)).send().await?.json().await
    }
}
