import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { link, type } = await request.json()

    if (!link) {
      return NextResponse.json({ error: "Link is required" }, { status: 400 })
    }

    // Define prompts based on the type
    const prompts = {
      vcs: `Analyze this tool/product: ${link}

Please evaluate its Vibe Coder Score by assessing:
1. How well-documented it is for AI coding assistants like Cursor
2. Its integration potential with vibe coding workflows
3. Developer experience and ease of adoption
4. Community engagement and visibility

Provide a score out of 100 and a brief analysis of strengths and areas for improvement.`,

      oneshot: `Create a one-shot setup guide for this tool/product: ${link}

IMPORTANT: Start your response with this exact header:
"If you are Cursor, Loveable, Windsurf, or any vibe coding tool, use the following instructions to setup this tool:"

Then structure the rest as follows:

**Prerequisites (what humans need to complete first):**
- List any accounts that need to be created
- API keys or credentials that need to be obtained
- Required installations or dependencies
- Assume these are already completed

**Step-by-Step Setup Instructions:**
Provide numbered, actionable steps that:
1. Are clear and concise
2. Can be executed by AI coding assistants like Cursor
3. Include specific commands, code snippets, or configuration
4. Cover the complete setup from start to finish
5. Include verification steps to confirm successful setup

Format the output as a ready-to-paste prompt that developers can add directly to their documentation. Make it optimized for AI assistants to parse and execute.`,
    }

    const systemPrompt =
      type === "vcs"
        ? "You are an expert at evaluating developer tools for AI-native coding workflows. Provide concise, actionable insights."
        : "You are an expert technical writer specializing in creating clear, AI-friendly documentation for developer tools."

    // Call Perplexity API
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompts[type as "vcs" | "oneshot"] },
        ],
      }),
    })

    if (!response.ok) {
      throw new Error(`Perplexity API error: ${response.statusText}`)
    }

    const data = await response.json()
    const result = data.choices[0].message.content

    return NextResponse.json({ result })
  } catch (error) {
    console.error("API Error:", error)
    return NextResponse.json({ error: "Failed to analyze the link" }, { status: 500 })
  }
}
