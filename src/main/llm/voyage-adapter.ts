/**
 * Voyage AI has an OpenAI-compatible endpoint at https://api.voyageai.com/v1
 * but uses different field names:
 *   - `output_dimension` instead of `dimensions`
 *   - `input_type` (accepts "query" | "document") instead of OpenAI's task hints
 *
 * This adapter translates between the AI SDK's OpenAI-compatible format
 * and Voyage AI's actual API.
 */

interface VoyageEmbeddingRequest {
  input: string | string[]
  model: string
  input_type?: 'query' | 'document'
  output_dimension?: number
  truncation?: boolean
}

interface VoyageEmbeddingResponse {
  object: string
  data: Array<{ object: string; index: number; embedding: number[] }>
  model: string
  usage: { total_tokens: number }
}

export async function voyageEmbed(
  baseUrl: string,
  apiKey: string,
  model: string,
  input: string | string[],
  options?: { inputType?: 'query' | 'document'; outputDimension?: number }
): Promise<{ embeddings: number[][]; usage: { totalTokens: number } }> {
  const body: VoyageEmbeddingRequest = {
    input,
    model,
    ...(options?.inputType && { input_type: options.inputType }),
    ...(options?.outputDimension && { output_dimension: options.outputDimension })
  }

  const response = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Voyage AI error (${response.status}): ${errorText}`)
  }

  const data: VoyageEmbeddingResponse = await response.json()

  return {
    embeddings: data.data.map((d) => d.embedding),
    usage: { totalTokens: data.usage.total_tokens }
  }
}
