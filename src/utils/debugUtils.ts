export const logError = (context: string, error: any) => {
  console.error(`[${context}] Error:`, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    fullError: error
  });
};

export const logSuccess = (context: string, data: any) => {
  console.log(`[${context}] Success:`, data);
};

export const logDebug = (context: string, data: any) => {
  console.log(`[${context}] Debug:`, data);
};