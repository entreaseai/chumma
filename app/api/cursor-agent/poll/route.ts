import { type NextRequest, NextResponse } from "next/server"

// Helper function to poll agent status until completion
async function pollAgentStatus(agentId: string, maxWaitTime = 300000): Promise<any> {
  const startTime = Date.now()
  const pollInterval = 3000 // Poll every 3 seconds

  while (Date.now() - startTime < maxWaitTime) {
    console.log("[v0] Polling agent status for ID:", agentId)

    const response = await fetch(`https://api.cursor.com/v0/agents/${agentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CURSOR_BACKGROUND_AGENT}`,
      },
    })

    const data = await response.json()
    console.log("[v0] Agent Status:", data.status)

    if (
      data.status === "COMPLETED" ||
      data.status === "FINISHED" ||
      data.status === "completed" ||
      data.status === "finished"
    ) {
      console.log("[v0] Agent completed successfully!")

      console.log("[v0] Fetching conversation for agent:", agentId)
      const conversationResponse = await fetch(`https://api.cursor.com/v0/agents/${agentId}/conversation`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.CURSOR_BACKGROUND_AGENT}`,
        },
      })

      const conversation = await conversationResponse.json()
      console.log("[v0] Conversation Retrieved:", JSON.stringify(conversation, null, 2))

      const assistantMessage = conversation.messages?.find((msg: any) => msg.type === "assistant_message")
      const answer = assistantMessage?.text || "No answer found"

      return {
        agent: data,
        answer: answer,
      }
    }

    if (data.status === "FAILED" || data.status === "failed") {
      console.log("[v0] Agent failed:", data.error)
      throw new Error(`Agent failed: ${data.error || "Unknown error"}`)
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error("Agent polling timeout - exceeded maximum wait time")
}

export async function POST(req: NextRequest) {
  try {
    const { agentId } = await req.json()

    if (!agentId) {
      return NextResponse.json({ success: false, error: "Agent ID is required" }, { status: 400 })
    }

    console.log("[v0] Starting to poll for agent completion:", agentId)

    // Poll for completion and get conversation
    const result = await pollAgentStatus(agentId)

    console.log("[v0] Final Result with Conversation:", JSON.stringify(result, null, 2))

    return NextResponse.json({
      success: true,
      answer: result.answer,
      agentId: result.agent.id,
      status: result.agent.status,
    })
  } catch (error) {
    console.error("[v0] Cursor Agent Poll Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to poll agent status",
      },
      { status: 500 },
    )
  }
}
