export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const matchId = searchParams.get("matchId")

  if (!matchId) {
    return Response.json({ error: "Match ID is required" }, { status: 400 })
  }

  try {
    const response = await fetch(`https://betmaster.com/api/feed/sr/matches/${matchId}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    })

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`)
    }

    const data = await response.json()
    return Response.json(data.match || data)
  } catch (error) {
    console.error("Error fetching match details:", error)
    return Response.json({ error: "Failed to fetch match details" }, { status: 500 })
  }
}
