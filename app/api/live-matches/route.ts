export async function GET() {
  const MAX_RETRIES = 3
  const RETRY_DELAY = 1000 // 1 second

  async function fetchWithRetry(attempt = 1): Promise<Response> {
    try {
      const baseUrl = "https://betmaster.com/api/feed/sr/matches/sport/live"
      const params = new URLSearchParams({
        sport_id: "sr:sport:1",
        markets_set: "main_extended",
        market: "other",
      })

      const fullUrl = `${baseUrl}?${params.toString()}`

      const response = await fetch(fullUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          Referer: "https://betmaster.com/",
          Origin: "https://betmaster.com",
        },
        cache: "no-store",
        next: { revalidate: 0 },
      })

      if (!response.ok) {
        const errorText = await response.text()

        // If it's a 400 error and we haven't exceeded retries, try again
        if (response.status === 400 && attempt < MAX_RETRIES) {
          console.log(
            `[v0] API request failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY * attempt}ms...`,
          )
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt))
          return fetchWithRetry(attempt + 1)
        }

        throw new Error(`API returned ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      return Response.json(data)
    } catch (error) {
      // If we haven't exceeded retries, try again
      if (attempt < MAX_RETRIES) {
        console.log(`[v0] Fetch error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY * attempt}ms...`)
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY * attempt))
        return fetchWithRetry(attempt + 1)
      }

      throw error
    }
  }

  try {
    return await fetchWithRetry()
  } catch (error) {
    console.error("[v0] All retry attempts failed:", error)
    // Return empty matches instead of error to prevent UI breaking
    return Response.json(
      {
        matches: [],
        error: "temporarily unavailable",
      },
      { status: 200 },
    )
  }
}
