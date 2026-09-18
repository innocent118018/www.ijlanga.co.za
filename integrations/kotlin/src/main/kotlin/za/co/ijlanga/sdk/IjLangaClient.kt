package za.co.ijlanga.sdk

import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import kotlinx.serialization.Serializable

@Serializable
data class ApiResponse<T>(val ok: Boolean, val data: T? = null, val error: String? = null)

class IjLangaClient(private val baseUrl: String, private val http: HttpClient = HttpClient()) {
    suspend fun health(): ApiResponse<Map<String, String>> =
        http.get("$baseUrl/api/health").body()
}
