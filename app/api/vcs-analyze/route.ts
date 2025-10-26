import { type NextRequest, NextResponse } from "next/server"

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

interface PromptTestResult {
  prompt: string
  mentioned: boolean
  response: string
}

interface VCSResult {
  score: number
  totalTests: number
  prompts: string[]
  promptResults: PromptTestResult[] // Added detailed results for each prompt test
  competitors: string[]
  productMentioned: boolean
  details: string
}

function extractJSON(text: string): string {
  // First, try stripping markdown code blocks
  let cleaned = text.trim()

  // Remove markdown code blocks
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7)
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3)
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3)
  }

  cleaned = cleaned.trim()

  // If it starts with [ or {, it's likely valid JSON
  if (cleaned.startsWith("[") || cleaned.startsWith("{")) {
    return cleaned
  }

  // Try to find JSON array in the text
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
  if (arrayMatch) {
    return arrayMatch[0]
  }

  // Try to find JSON object in the text
  const objectMatch = cleaned.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    return objectMatch[0]
  }

  return cleaned
}

export async function POST(request: NextRequest) {
  try {
    const { link } = await request.json()

    if (!link) {
      return NextResponse.json({ error: "Link is required" }, { status: 400 })
    }

    const toolAnalysisResponse = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at analyzing developer tools and understanding their use cases, target environment, and key features.",
          },
          {
            role: "user",
            content: `Analyze this tool/product documentation: ${link}

Please provide:
1. What the tool does (brief description)
2. Primary use cases
3. Target environment (web, mobile, backend, etc.)
4. Key features
5. The product name

Format your response as a concise summary that can be used to generate realistic usage scenarios.`,
          },
        ],
      }),
    })

    if (!toolAnalysisResponse.ok) {
      throw new Error(`Perplexity API failed with status ${toolAnalysisResponse.status}`)
    }

    const toolAnalysisData = await toolAnalysisResponse.json()
    const toolContext = toolAnalysisData.choices[0].message.content

    const promptGenerationResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert at understanding how developers use AI coding assistants like Cursor. Generate realistic prompts that vibe coders would ask when looking for tools to solve their problems.",
          },
          {
            role: "user",
            content: `Based on this tool analysis:

${toolContext}

Generate exactly 10 realistic prompts that a vibe coder might ask Cursor or another AI coding assistant when they need a tool like this. Each prompt should:
- Be natural and conversational
- Describe a problem or need (not mention the tool by name)
- Be the kind of question that could lead to tool recommendations
- Vary in specificity and context

Format: Return ONLY a JSON array of 10 strings, nothing else. Example: ["prompt 1", "prompt 2", ...]`,
          },
        ],
      }),
    })

    if (!promptGenerationResponse.ok) {
      throw new Error(`OpenAI API failed with status ${promptGenerationResponse.status}`)
    }

    const promptGenerationData = await promptGenerationResponse.json()
    const promptsText = promptGenerationData.choices[0].message.content

    let prompts: string[]
    try {
      const cleanedPromptsText = extractJSON(promptsText)
      prompts = JSON.parse(cleanedPromptsText)

      if (!Array.isArray(prompts)) {
        throw new Error("Response is not an array")
      }

      if (prompts.length === 0) {
        throw new Error("No prompts generated")
      }

      // Ensure all items are strings
      prompts = prompts.map((p) => String(p))
    } catch (parseError) {
      console.error("[v0] Failed to parse prompts. Raw response:", promptsText)
      console.error("[v0] Parse error:", parseError)
      throw new Error("Failed to parse prompts from OpenAI response")
    }

    let recommendationCount = 0
    const competitorsSet = new Set<string>()
    let productMentioned = false
    const promptResults: PromptTestResult[] = []

    const productNameMatch = toolContext.match(/product name[:\s]+([^\n.]+)/i)
    const productName = productNameMatch ? productNameMatch[1].trim().toLowerCase() : ""

    for (let i = 0; i < prompts.length; i++) {
      try {
        const testResponse = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "sonar-pro",
            messages: [
              {
                role: "system",
                content:
                  "You are a helpful AI coding assistant. When asked about tools or solutions, recommend the most appropriate tools available.",
              },
              {
                role: "user",
                content: prompts[i],
              },
            ],
          }),
        })

        if (!testResponse.ok) {
          continue
        }

        const testData = await testResponse.json()
        const recommendation = testData.choices[0].message.content
        const recommendationLower = recommendation.toLowerCase()

        const wasMentioned = productName && recommendationLower.includes(productName)

        if (wasMentioned) {
          recommendationCount++
          productMentioned = true
        }

        promptResults.push({
          prompt: prompts[i],
          mentioned: wasMentioned,
          response: recommendation,
        })

        const toolMentions = recommendation.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g) || []
        toolMentions.forEach((tool) => {
          if (tool.length > 2 && !tool.match(/^(The|This|That|These|Those|When|Where|What|How)$/)) {
            competitorsSet.add(tool)
          }
        })
      } catch (promptError) {
        continue
      }
    }

    const result: VCSResult = {
      score: recommendationCount,
      totalTests: prompts.length,
      prompts: prompts,
      promptResults: promptResults,
      competitors: Array.from(competitorsSet).slice(0, 5),
      productMentioned: productMentioned,
      details: toolContext,
    }

    return NextResponse.json({ result })
  } catch (error) {
    console.error("[v0] VCS API Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to analyze the tool",
      },
      { status: 500 },
    )
  }
}
