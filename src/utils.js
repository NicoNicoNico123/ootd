// Utility functions for the application

// Helper function to safely log payloads by masking sensitive fields
// This prevents API keys and other sensitive data from appearing in console logs
export function safeLogPayload(label, payload) {
  const sensitiveFields = ['apiKey', 'api_key', 'API_KEY', 'apikey', 'password', 'token', 'secret'];
  
  const maskSensitiveData = (obj) => {
    if (obj === null || obj === undefined) return obj;
    
    if (Array.isArray(obj)) {
      return obj.map(item => maskSensitiveData(item));
    }
    
    if (typeof obj === 'object') {
      const masked = {};
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
          masked[key] = '***MASKED***';
        } else if (typeof value === 'object') {
          masked[key] = maskSensitiveData(value);
        } else {
          masked[key] = value;
        }
      }
      return masked;
    }
    
    return obj;
  };
  
  const safePayload = maskSensitiveData(payload);
  console.log(label, JSON.stringify(safePayload, null, 2));
}

