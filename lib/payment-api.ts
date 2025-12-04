function formatPhoneNumber(phone: string): string {
  // Remove any spaces or special characters except +
  let cleaned = phone.replace(/[^\d+]/g, "")

  // If doesn't start with +, assume Uganda (+256)
  if (!cleaned.startsWith("+")) {
    // Remove leading 0 if present
    if (cleaned.startsWith("0")) {
      cleaned = cleaned.substring(1)
    }
    cleaned = "+256" + cleaned
  }

  return cleaned
}

const API_BASE = "https://lucky-sun-a4fc.globalnexussystem-tech.workers.dev"

export interface PaymentResponse {
  success: boolean
  status: string
  message: string
  customer_reference?: string
  internal_reference?: string
  msisdn?: string
  amount?: number
  currency?: string
  provider?: string
  charge?: number
  request_status?: string
  provider_transaction_id?: string
  completed_at?: string
  error?: string
  relworx?: {
    success: boolean
    message: string
    error_code?: string
    status?: string
    request_status?: string
    provider_transaction_id?: string
    customer_reference?: string
    amount?: number
    charge?: number
    provider?: string
    completed_at?: string
    msisdn?: string
    currency?: string
  }
}

export async function callPaymentAPI(endpoint: string, bodyData: Record<string, any>): Promise<PaymentResponse> {
  const url = `${API_BASE}${endpoint}`

  try {
    const formattedData = {
      ...bodyData,
      msisdn: bodyData.msisdn ? formatPhoneNumber(bodyData.msisdn) : bodyData.msisdn,
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formattedData),
    })

    const data = await response.json()
    console.log("[v0] Payment API raw response:", data)
    return data
  } catch (err) {
    console.error("[v0] API Error:", err)
    return { success: false, status: "error", message: err instanceof Error ? err.message : "API Error" }
  }
}

export async function checkPaymentStatus(internalReference: string): Promise<PaymentResponse> {
  const url = `${API_BASE}/api/request-status?internal_reference=${internalReference}`

  try {
    const response = await fetch(url)
    const data = await response.json()
    return data
  } catch (err) {
    console.error("[v0] Status check error:", err)
    return { success: false, status: "error", message: err instanceof Error ? err.message : "Status check failed" }
  }
}

export async function pollPaymentStatus(
  internalReference: string,
  maxAttempts = 30,
  intervalMs = 2000,
  onStatusUpdate?: (status: PaymentResponse) => void,
): Promise<PaymentResponse> {
  console.log("[v0] Starting payment status poll for:", internalReference)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await checkPaymentStatus(internalReference)
    console.log(`[v0] Poll attempt ${attempt + 1}/${maxAttempts}:`, status)

    onStatusUpdate?.(status)

    const isSuccess =
      (status.status === "success" && status.request_status === "success" && status.provider_transaction_id) ||
      (status.relworx?.status === "success" &&
        status.relworx?.request_status === "success" &&
        status.relworx?.provider_transaction_id)

    if (isSuccess) {
      console.log("[v0] Payment successful!")
      console.log("[v0] Final payment status:", status)
      // Return flattened data from relworx if needed
      return {
        ...status,
        status: status.relworx?.status || status.status,
        request_status: status.relworx?.request_status || status.request_status,
        provider_transaction_id: status.relworx?.provider_transaction_id || status.provider_transaction_id,
        customer_reference: status.relworx?.customer_reference || status.customer_reference,
        amount: status.relworx?.amount || status.amount,
        charge: status.relworx?.charge || status.charge,
        provider: status.relworx?.provider || status.provider,
        completed_at: status.relworx?.completed_at || status.completed_at,
        msisdn: status.relworx?.msisdn || status.msisdn,
        currency: status.relworx?.currency || status.currency,
      }
    }

    const isFailed = status.status === "failed" || status.status === "error" || status.relworx?.status === "failed"
    if (isFailed) {
      console.log("[v0] Payment failed:", status.message || status.relworx?.message)
      return status
    }

    // Keep polling for "pending" or "in progress" statuses
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  return {
    success: false,
    status: "timeout",
    message: "Payment status check timed out after maximum attempts",
  }
}
