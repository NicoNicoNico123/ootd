// Load API configuration from environment variables
// Note: Vite requires VITE_ prefix for client-side environment variables
export const API_CONFIG = {
  url: import.meta.env.VITE_API_URL || 'https://www.runninghub.ai/task/openapi/ai-app/run',
  webappId: import.meta.env.VITE_WEBAPP_ID || '',
  apiKey: import.meta.env.VITE_API_KEY || '',
  host: import.meta.env.VITE_API_HOST || 'www.runninghub.ai',
  // API endpoints
  statusUrl: import.meta.env.VITE_STATUS_URL || 'https://www.runninghub.cn/task/openapi/status',
  outputsUrl: import.meta.env.VITE_OUTPUTS_URL || 'https://www.runninghub.cn/task/openapi/outputs',
  accountStatusUrl: import.meta.env.VITE_ACCOUNT_STATUS_URL || 'https://www.runninghub.cn/uc/openapi/accountStatus'
};

// Validate that required environment variables are set
if (!API_CONFIG.apiKey || !API_CONFIG.webappId) {
  console.error('Missing required environment variables: VITE_API_KEY and/or VITE_WEBAPP_ID');
}

// Function to get account status (including currentTaskCounts)
export const getAccountStatus = async () => {
  const accountStatusEndpoint = API_CONFIG.accountStatusUrl;
  
  try {
    const response = await fetch(accountStatusEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: Host header cannot be set in browser fetch - browser automatically sets it to the domain in the URL
      },
      body: JSON.stringify({
        apikey: API_CONFIG.apiKey,
      }),
    });

    const data = await response.json();
    console.log('Account status response:', JSON.stringify(data, null, 2));
    
    if (data.code !== 0) {
      throw new Error(data.msg || 'Failed to get account status');
    }

    // Return account data including currentTaskCounts
    return {
      remainCoins: data.data?.remainCoins,
      currentTaskCounts: parseInt(data.data?.currentTaskCounts || '0', 10),
      remainMoney: data.data?.remainMoney,
      currency: data.data?.currency,
      apiType: data.data?.apiType
    };
  } catch (error) {
    console.error('Error getting account status:', error);
    throw error;
  }
};

// Function to check task status using the status endpoint
// API returns simple status string like "RUNNING", "SUCCESS", "FAILED", "QUEUED"
export const checkTaskStatus = async (taskId) => {
  const statusEndpoint = API_CONFIG.statusUrl;
  
  try {
    const response = await fetch(statusEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: API_CONFIG.apiKey,
        taskId: taskId,
      }),
    });

    const data = await response.json();
    
    // Log the full response to debug
    console.log('Status API response:', JSON.stringify(data, null, 2));
    
    if (data.code !== 0) {
      // Handle special status codes
      if (data.code === 804) {
        // APIKEY_TASK_IS_RUNNING
        return { status: 'RUNNING' };
      } else if (data.code === 813) {
        // APIKEY_TASK_IS_QUEUED
        return { status: 'QUEUED' };
      } else if (data.code === 805) {
        // APIKEY_TASK_STATUS_ERROR - task failed
        return { status: 'FAILED' };
      }
      throw new Error(data.msg || 'Failed to check task status');
    }

    // Extract status - API returns simple string like "RUNNING"
    let status = 'UNKNOWN';
    if (typeof data.data === 'string') {
      status = data.data.toUpperCase();
    } else if (data.data && typeof data.data === 'object') {
      status = (data.data.taskStatus || data.data.status || data.data.state || 'UNKNOWN').toUpperCase();
    }
    
    return { status };
  } catch (error) {
    console.error('Error checking task status:', error);
    throw error;
  }
};

// Function to get task outputs (results) using the outputs endpoint
export const getTaskOutputs = async (taskId) => {
  const outputsEndpoint = API_CONFIG.outputsUrl;
  
  try {
    const response = await fetch(outputsEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: API_CONFIG.apiKey,
        taskId: taskId,
      }),
    });

    const data = await response.json();
    console.log('Task outputs response:', JSON.stringify(data, null, 2));
    
    if (data.code !== 0) {
      // Handle special status codes
      if (data.code === 804) {
        // APIKEY_TASK_IS_RUNNING
        throw new Error('Task is still running');
      } else if (data.code === 813) {
        // APIKEY_TASK_IS_QUEUED
        throw new Error('Task is still queued');
      } else if (data.code === 805) {
        // APIKEY_TASK_STATUS_ERROR - task failed
        const failedReason = data.data?.failedReason;
        const errorMsg = failedReason?.exception_message || failedReason?.node_name || data.msg || 'Task failed';
        throw new Error(errorMsg);
      }
      throw new Error(data.msg || 'Failed to get task outputs');
    }

    // Outputs endpoint returns an array of file objects
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      // Find the first file with a fileUrl (usually the generated image)
      for (const file of data.data) {
        if (file.fileUrl) {
          return file.fileUrl;
        }
      }
      // If no fileUrl found, return the first item for further processing
      return data.data[0];
    }
    
    throw new Error('No outputs found in response');
  } catch (error) {
    console.error('Error getting task outputs:', error);
    throw error;
  }
};

// HTTP polling function with time-based progress calculation
// Each task can run up to 3 minutes (180 seconds)
export const pollTaskStatusHttp = async (taskId, clientId, maxAttempts = 120, interval = 2000, setProgress, taskStartTimeRef) => {
  const MAX_TASK_DURATION = 180000; // 3 minutes in milliseconds
  const startTime = taskStartTimeRef.current || Date.now();
  if (!taskStartTimeRef.current) {
    taskStartTimeRef.current = startTime;
  }
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await new Promise(resolve => setTimeout(resolve, interval));
      
      // Check task status using the status endpoint
      const { status } = await checkTaskStatus(taskId);
      
      // Calculate progress based on elapsed time (0-3 minutes = 0-100%)
      const elapsedTime = Date.now() - startTime;
      const progressPercent = Math.min(Math.floor((elapsedTime / MAX_TASK_DURATION) * 100), 99); // Cap at 99% until completion
      if (setProgress) {
        setProgress({ value: progressPercent, max: 100 });
      }
      console.log(`Progress: ${progressPercent}% (elapsed: ${Math.floor(elapsedTime / 1000)}s / max: 180s)`);
      
      // Log every 10th attempt or when status changes
      if (attempt % 10 === 0 || status === 'SUCCESS' || status === 'FAILED') {
        console.log(`Polling attempt ${attempt + 1}: Task status = ${status}, Progress = ${progressPercent}%`);
      }

      if (status === 'SUCCESS') {
        // Task completed, get the outputs
        console.log('Task completed! Fetching outputs...');
        if (setProgress) {
          setProgress({ value: 100, max: 100 }); // Set to 100% on completion
        }
        taskStartTimeRef.current = null; // Reset start time
        const fileUrl = await getTaskOutputs(taskId);
        return fileUrl;
      } else if (status === 'FAILED') {
        // Task failed, try to get error details from outputs endpoint
        taskStartTimeRef.current = null; // Reset start time
        try {
          await getTaskOutputs(taskId);
        } catch (outputError) {
          throw new Error(outputError.message || 'Task failed');
        }
        throw new Error('Task failed');
      } else if (status === 'RUNNING' || status === 'QUEUED') {
        // Continue polling - task is still processing
        continue;
      } else {
        // Unknown status, continue polling
        console.warn(`Unknown status: ${status}, continuing to poll...`);
        continue;
      }
    } catch (err) {
      // If it's a "still running" or "still queued" error, continue polling
      if (err.message.includes('still running') || err.message.includes('still queued')) {
        continue;
      }
      
      if (attempt === maxAttempts - 1) {
        taskStartTimeRef.current = null; // Reset start time on error
        throw err;
      }
      console.warn(`Polling error (attempt ${attempt + 1}):`, err);
    }
  }

  taskStartTimeRef.current = null; // Reset start time on timeout
  throw new Error('Task polling timeout - task did not complete in time');
};

// Function to poll task status using HTTP polling only
export const pollTaskStatus = async (taskId, clientId, wsUrl, maxAttempts = 120, interval = 2000, setProgress, taskStartTimeRef) => {
  // Always use HTTP polling (WebSocket removed)
  return pollTaskStatusHttp(taskId, clientId, maxAttempts, interval, setProgress, taskStartTimeRef);
};

// Function to upload file and get hash
export const uploadFile = async (file) => {
  // Try the official upload endpoint (try .ai first to match working curl)
  const uploadEndpoints = [
    'https://www.runninghub.ai/task/openapi/upload',
    'https://www.runninghub.cn/task/openapi/upload', // Fallback to .cn
  ];

  for (const endpoint of uploadEndpoints) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('fileType', 'image');
      formData.append('apiKey', API_CONFIG.apiKey);

      const response = await fetch(endpoint, {
        method: 'POST',
        // Don't set Content-Type header - browser will set it automatically with boundary for FormData
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Upload response:', data);
        
        if (data.code === 0 && data.data) {
          // Official format: data.data.fileName
          if (data.data.fileName) {
            return data.data.fileName;
          }
        }
        
        // Try different possible response formats
        if (data.fileHash || data.hash || data.file_id || data.id || data.fileName) {
          return data.fileHash || data.hash || data.file_id || data.id || data.fileName;
        }
        if (data.data && (data.data.fileHash || data.data.hash || data.data.file_id || data.data.fileName)) {
          return data.data.fileHash || data.data.hash || data.data.file_id || data.data.fileName;
        }
        if (typeof data === 'string') {
          return data;
        }
      } else {
        // Log the error response for debugging
        const errorData = await response.json().catch(() => ({}));
        console.log(`Upload endpoint ${endpoint} returned ${response.status}:`, errorData);
      }
    } catch (e) {
      // Silently continue to next endpoint or fallback
      console.log(`Upload endpoint ${endpoint} failed:`, e.message);
      continue;
    }
  }

  // If no upload endpoint works, generate a hash from file content
  // This is a fallback - using file hash as identifier
  console.log('Upload endpoints unavailable, generating hash from file content (this may work if API accepts file hashes)...');
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target.result;
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        // Append original extension
        const extension = file.name.split('.').pop();
        resolve(`${hashHex}.${extension}`);
      } catch (hashError) {
        console.error('Error generating hash:', hashError);
        // Fallback to filename if hash generation fails
        resolve(file.name);
      }
    };
    reader.onerror = () => {
      console.error('FileReader error, using filename as fallback');
      resolve(file.name);
    };
    reader.readAsArrayBuffer(file);
  });
};

