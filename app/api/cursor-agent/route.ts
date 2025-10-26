import { type NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json()

    console.log("[v0] Starting Cursor Background Agent with prompt:", prompt)

    // Cursor Background Agent API URL
    const url = "https://api.cursor.com/v0/agents"

    // Create a new background agent
    const createResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CURSOR_BACKGROUND_AGENT}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: {
          text: prompt,
        },
        source: {
          repository: "https://github.com/kapz28/emptyrepoforcursor",
          ref: "main",
        },
      }),
    })

    const createData = await createResponse.json()

    console.log("[v0] Cursor Agent Created:", JSON.stringify(createData, null, 2))
    console.log("[v0] Agent ID:", createData.id)
    console.log("[v0] Initial Status:", createData.status)

    return NextResponse.json({
      success: true,
      agentId: createData.id,
      status: createData.status,
    })
  } catch (error) {
    console.error("[v0] Cursor Agent Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create agent",
      },
      { status: 500 },
    )
  }
}
