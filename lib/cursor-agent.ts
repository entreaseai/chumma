// Shared Cursor Background Agent utilities

export async function createCursorAgent(prompt: string): Promise<{ agentId: string; status: string }> {
  console.log("[v0] Creating Cursor Background Agent with prompt:", prompt)

  const url = "https://api.cursor.com/v0/agents"

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

  if (!createResponse.ok) {
    const errorText = await createResponse.text()
    throw new Error(`Failed to create agent: ${createResponse.status} ${errorText}`)
  }

  const createData = await createResponse.json()

  console.log("[v0] Cursor Agent Created - ID:", createData.id, "Status:", createData.status)

  return {
    agentId: createData.id,
    status: createData.status,
  }
}

export async function pollCursorAgent(agentId: string, maxWaitTime = 300000): Promise<string> {
  console.log("[v0] Starting to poll agent:", agentId)

  const startTime = Date.now()
  const pollInterval = 3000 // Poll every 3 seconds

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`https://api.cursor.com/v0/agents/${agentId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CURSOR_BACKGROUND_AGENT}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to poll agent: ${response.status}`)
    }

    const data = await response.json()
    console.log("[v0] Agent Status:", data.status)

    if (
      data.status === "COMPLETED" ||
      data.status === "FINISHED" ||
      data.status === "completed" ||
      data.status === "finished"
    ) {
      console.log("[v0] Agent completed! Fetching conversation...")

      // Get the conversation
      const conversationResponse = await fetch(`https://api.cursor.com/v0/agents/${agentId}/conversation`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.CURSOR_BACKGROUND_AGENT}`,
        },
      })

      if (!conversationResponse.ok) {
        throw new Error(`Failed to fetch conversation: ${conversationResponse.status}`)
      }

      const conversation = await conversationResponse.json()
      const assistantMessage = conversation.messages?.find((msg: any) => msg.type === "assistant_message")
      const answer = assistantMessage?.text || "No answer found"

      console.log("[v0] Answer retrieved successfully")
      return answer
    }

    if (data.status === "FAILED" || data.status === "failed") {
      throw new Error(`Agent failed: ${data.error || "Unknown error"}`)
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error("Agent polling timeout - exceeded maximum wait time")
}

// Combined function to create and poll in one call
export async function runCursorAgent(prompt: string): Promise<string> {
  const { agentId } = await createCursorAgent(prompt)
  const answer = await pollCursorAgent(agentId)
  return answer
}
