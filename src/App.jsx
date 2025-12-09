import React, { useState, useRef } from 'react';

import { Upload, Share2, Download, Image as ImageIcon, Loader2, RefreshCw, AlertCircle, Check } from 'lucide-react';



// Load API configuration from environment variables
// Note: Vite requires VITE_ prefix for client-side environment variables
const API_CONFIG = {
  url: import.meta.env.VITE_API_URL || 'https://www.runninghub.ai/task/openapi/ai-app/run',
  webappId: import.meta.env.VITE_WEBAPP_ID || '',
  apiKey: import.meta.env.VITE_API_KEY || '',
  host: import.meta.env.VITE_API_HOST || 'www.runninghub.ai',
  // API endpoints
  statusUrl: import.meta.env.VITE_STATUS_URL || 'https://www.runninghub.cn/task/openapi/status',
  outputsUrl: import.meta.env.VITE_OUTPUTS_URL || 'https://www.runninghub.cn/task/openapi/outputs'
};

// Validate that required environment variables are set
if (!API_CONFIG.apiKey || !API_CONFIG.webappId) {
  console.error('Missing required environment variables: VITE_API_KEY and/or VITE_WEBAPP_ID');
}



export default function App() {

  const [modelFile, setModelFile] = useState(null);
  const [modelPreview, setModelPreview] = useState(null);
  
  const [clothingFile, setClothingFile] = useState(null);
  const [clothingPreview, setClothingPreview] = useState(null);

  const [generatedImage, setGeneratedImage] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [progress, setProgress] = useState({ value: 0, max: 100 });

  

  // Configuration State



  const modelInputRef = useRef(null);
  const clothingInputRef = useRef(null);
  const totalNodesRef = useRef(null); // Store total nodes to execute from promptTips



  const handleFileSelect = (type, e) => {

    const file = e.target.files[0];

    if (file) {

      const previewUrl = URL.createObjectURL(file);

      if (type === 'model') {

        setModelFile(file);

        setModelPreview(previewUrl);

      } else if (type === 'clothing') {

        setClothingFile(file);

        setClothingPreview(previewUrl);

      }

      setGeneratedImage(null);

      setError('');

    }

  };



  const triggerFileSelect = (type) => {

    if (type === 'model') {

      modelInputRef.current.click();

    } else if (type === 'clothing') {

      clothingInputRef.current.click();

    }

  };



  // Function to poll task status or use WebSocket
  const pollTaskStatus = async (taskId, clientId, wsUrl, maxAttempts = 120, interval = 2000) => {
    // Try WebSocket first if URL is provided
    if (wsUrl) {
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          // Fall back to polling
          console.log('WebSocket timeout, falling back to polling...');
          pollTaskStatusHttp(taskId, clientId, maxAttempts, interval).then(resolve).catch(reject);
        }, 120000); // 2 minute timeout for WebSocket

        ws.onopen = () => {
          console.log('WebSocket connected, waiting for task completion...');
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message:', JSON.stringify(message, null, 2));
            
            // Handle different message types
            const messageType = message.type || message.event || message.status;
            
            // Handle progress messages
            if (messageType === 'progress' && message.data) {
              const progressValue = message.data.value ?? 0;
              const progressMax = message.data.max ?? 100;
              setProgress({ value: progressValue, max: progressMax });
              console.log(`Progress: ${progressValue}/${progressMax} (${Math.round((progressValue / progressMax) * 100)}%)`);
              return;
            }
            
            // Task is still running
            if (messageType === 'execution_cached' || messageType === 'executing' || 
                messageType === 'status' && message.data?.taskStatus === 'RUNNING') {
              console.log('Task still running...');
              return;
            }
            
            // Task completed - check various message formats
            if (messageType === 'executed' || messageType === 'execution_complete' || 
                messageType === 'completed' || messageType === 'success' ||
                (messageType === 'status' && (message.data?.taskStatus === 'SUCCESS' || message.data?.taskStatus === 'COMPLETED'))) {
              
              console.log('Task completed, extracting result...');
              setProgress({ value: 100, max: 100 }); // Set to 100% on completion
              clearTimeout(timeout);
              
              // Try multiple ways to extract image URL
              let imageUrl = null;
              
              // Method 1: Check data.output array
              if (message.data?.output) {
                const output = message.data.output;
                if (Array.isArray(output) && output.length > 0) {
                  for (const item of output) {
                    if (item.filename || item.url || item.imageUrl) {
                      imageUrl = item.filename || item.url || item.imageUrl;
                      break;
                    }
                  }
                } else if (typeof output === 'string') {
                  imageUrl = output;
                } else if (output.filename || output.url || output.imageUrl) {
                  imageUrl = output.filename || output.url || output.imageUrl;
                }
              }
              
              // Method 2: Check data.result
              if (!imageUrl && message.data?.result) {
                if (typeof message.data.result === 'string') {
                  imageUrl = message.data.result;
                } else if (message.data.result.filename || message.data.result.url || message.data.result.imageUrl) {
                  imageUrl = message.data.result.filename || message.data.result.url || message.data.result.imageUrl;
                }
              }
              
              // Method 3: Check data.resultUrl or data.url
              if (!imageUrl) {
                imageUrl = message.data?.resultUrl || message.data?.url || message.data?.imageUrl;
              }
              
              // Method 4: Check top-level properties
              if (!imageUrl) {
                imageUrl = message.resultUrl || message.url || message.imageUrl || message.filename;
              }
              
              // Method 5: Check if message has images array
              if (!imageUrl && message.images && Array.isArray(message.images) && message.images.length > 0) {
                imageUrl = message.images[0].filename || message.images[0].url || message.images[0];
              }
              
              if (imageUrl) {
                // Construct full URL if it's a relative path
                if (imageUrl.startsWith('http')) {
                  ws.close();
                  resolve(imageUrl);
                  return;
                } else {
                  // Try both domains
                  const fullUrl = imageUrl.startsWith('/') 
                    ? `https://www.runninghub.ai${imageUrl}`
                    : `https://www.runninghub.ai/${imageUrl}`;
                  ws.close();
                  resolve(fullUrl);
                  return;
                }
              }
              
              // If we can't extract URL from WebSocket, wait a bit then fall back to polling
              console.log('WebSocket completed but no URL found in message, waiting 2s then polling...');
              ws.close();
              setTimeout(() => {
                pollTaskStatusHttp(taskId, clientId, maxAttempts, interval).then(resolve).catch(reject);
              }, 2000);
              return;
            }
            
            // Check if message contains task status update
            if (message.data?.taskStatus === 'SUCCESS' || message.data?.taskStatus === 'COMPLETED') {
              console.log('Task status updated to SUCCESS, polling for result...');
              ws.close();
              pollTaskStatusHttp(taskId, clientId, maxAttempts, interval).then(resolve).catch(reject);
              return;
            }
            
            if (message.data?.taskStatus === 'FAILED') {
              ws.close();
              reject(new Error(message.data.error || message.msg || 'Task failed'));
              return;
            }
            
          } catch (e) {
            console.error('Error parsing WebSocket message:', e, 'Raw message:', event.data);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          clearTimeout(timeout);
          ws.close();
          // Fall back to polling
          console.log('WebSocket error, falling back to HTTP polling...');
          pollTaskStatusHttp(taskId, clientId, maxAttempts, interval).then(resolve).catch(reject);
        };
        
        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          clearTimeout(timeout);
          // If closed unexpectedly and we haven't resolved, try polling
          if (!event.wasClean) {
            console.log('WebSocket closed unexpectedly, falling back to polling...');
            pollTaskStatusHttp(taskId, clientId, maxAttempts, interval).then(resolve).catch(reject);
          }
        };
      });
    } else {
      // No WebSocket URL, use HTTP polling
      return pollTaskStatusHttp(taskId, clientId, maxAttempts, interval);
    }
  };

  // Function to check task status using the status endpoint
  const checkTaskStatus = async (taskId) => {
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
      
      // Log the full response to debug progress information
      console.log('Status API response:', JSON.stringify(data, null, 2));
      
      if (data.code !== 0) {
        // Handle special status codes
        if (data.code === 804) {
          // APIKEY_TASK_IS_RUNNING
          return { status: 'RUNNING', progress: null };
        } else if (data.code === 813) {
          // APIKEY_TASK_IS_QUEUED
          return { status: 'QUEUED', progress: null };
        } else if (data.code === 805) {
          // APIKEY_TASK_STATUS_ERROR - task failed
          return { status: 'FAILED', progress: null };
        }
        throw new Error(data.msg || 'Failed to check task status');
      }

      // Extract status - could be a string or in an object
      let status = 'UNKNOWN';
      if (typeof data.data === 'string') {
        status = data.data;
      } else if (data.data && typeof data.data === 'object') {
        status = data.data.taskStatus || data.data.status || data.data.state || 'UNKNOWN';
      }
      
      // Extract progress information from various possible locations
      let progress = null;
      if (data.data && typeof data.data === 'object') {
        // Check for progress in data.data
        if (data.data.progress !== undefined) {
          const prog = data.data.progress;
          if (typeof prog === 'number') {
            progress = { value: prog, max: 100 };
          } else if (typeof prog === 'object' && (prog.value !== undefined || prog.current !== undefined)) {
            progress = {
              value: prog.value ?? prog.current ?? 0,
              max: prog.max ?? prog.total ?? 100
            };
          }
        }
        // Check for progress in other common fields
        if (!progress && data.data.currentStep !== undefined && data.data.totalSteps !== undefined) {
          progress = { value: data.data.currentStep, max: data.data.totalSteps };
        }
        if (!progress && data.data.step !== undefined && data.data.steps !== undefined) {
          progress = { value: data.data.step, max: data.data.steps };
        }
        // Check for percentage
        if (!progress && data.data.percentage !== undefined) {
          progress = { value: data.data.percentage, max: 100 };
        }
        
        // Extract progress from promptTips if available
        // promptTips contains JSON with outputs_to_execute array
        if (!progress && data.data.promptTips) {
          try {
            const promptTips = typeof data.data.promptTips === 'string' 
              ? JSON.parse(data.data.promptTips) 
              : data.data.promptTips;
            
            if (promptTips.outputs_to_execute && Array.isArray(promptTips.outputs_to_execute)) {
              const totalNodes = totalNodesRef.current || promptTips.outputs_to_execute.length;
              // If we have totalNodes stored, we can calculate progress
              // For now, we'll use a simple heuristic: if status is RUNNING, estimate based on time
              // Or we could track executed nodes if the API provides that info
              if (totalNodesRef.current) {
                // Estimate progress: if RUNNING, assume some progress has been made
                // This is a rough estimate - ideally the API would tell us which nodes completed
                if (status === 'RUNNING') {
                  // Estimate 30-70% progress when running (rough estimate)
                  // Without knowing which nodes completed, we can't be precise
                  progress = { value: Math.max(1, Math.floor(totalNodes * 0.5)), max: totalNodes };
                } else if (status === 'QUEUED') {
                  progress = { value: 0, max: totalNodes };
                }
              } else {
                // Store total nodes for future reference
                totalNodesRef.current = promptTips.outputs_to_execute.length;
                if (status === 'QUEUED') {
                  progress = { value: 0, max: totalNodesRef.current };
                }
              }
            }
          } catch (e) {
            console.warn('Failed to parse promptTips:', e);
          }
        }
      }
      
      // Check top-level progress fields
      if (!progress && data.progress !== undefined) {
        const prog = data.progress;
        if (typeof prog === 'number') {
          progress = { value: prog, max: 100 };
        } else if (typeof prog === 'object' && (prog.value !== undefined || prog.current !== undefined)) {
          progress = {
            value: prog.value ?? prog.current ?? 0,
            max: prog.max ?? prog.total ?? 100
          };
        }
      }
      
      // If still no progress but we have totalNodes, provide a basic progress indicator
      if (!progress && totalNodesRef.current) {
        if (status === 'QUEUED') {
          progress = { value: 0, max: totalNodesRef.current };
        } else if (status === 'RUNNING') {
          // Estimate 50% when running (we don't know exact progress)
          progress = { value: Math.floor(totalNodesRef.current * 0.5), max: totalNodesRef.current };
        }
      }
      
      return { status, progress };
    } catch (error) {
      console.error('Error checking task status:', error);
      throw error;
    }
  };

  // Function to get task outputs (results) using the outputs endpoint
  const getTaskOutputs = async (taskId) => {
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

  // HTTP polling function - updated to use correct endpoints
  const pollTaskStatusHttp = async (taskId, clientId, maxAttempts = 120, interval = 2000) => {
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, interval));
        
        // Check task status using the status endpoint
        const { status, progress } = await checkTaskStatus(taskId);
        
        // Update progress if available
        if (progress) {
          setProgress(progress);
          console.log(`Progress: ${progress.value}/${progress.max} (${Math.round((progress.value / progress.max) * 100)}%)`);
        }
        
        // Log every 10th attempt or when status changes
        if (attempt % 10 === 0 || status === 'SUCCESS' || status === 'FAILED') {
          console.log(`Polling attempt ${attempt + 1}: Task status = ${status}`, progress ? `Progress: ${progress.value}/${progress.max}` : '');
        }

        if (status === 'SUCCESS') {
          // Task completed, get the outputs
          console.log('Task completed! Fetching outputs...');
          setProgress({ value: 100, max: 100 }); // Set to 100% on completion
          const fileUrl = await getTaskOutputs(taskId);
          return fileUrl;
        } else if (status === 'FAILED') {
          // Task failed, try to get error details from outputs endpoint
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
          throw err;
        }
        console.warn(`Polling error (attempt ${attempt + 1}):`, err);
      }
    }

    throw new Error('Task polling timeout - task did not complete in time');
  };

  // Function to upload file and get hash
  const uploadFile = async (file) => {

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



  const handleGenerate = async () => {

    if (!modelFile || !clothingFile) {

      setError('Please upload both model and clothing images.');

      return;

    }



    setLoading(true);

    setError('');

    setProgress({ value: 0, max: 100 });
    totalNodesRef.current = null; // Reset total nodes for new generation



    try {

      // Upload both files to get their hashes
      console.log('Uploading model image...');
      const modelHash = await uploadFile(modelFile);
      console.log('Model hash obtained:', modelHash);
      
      console.log('Uploading clothing image...');
      const clothingHash = await uploadFile(clothingFile);
      console.log('Clothing hash obtained:', clothingHash);
      
      // Clear any previous errors
      setError('');

      const payload = {

        webappId: API_CONFIG.webappId,

        apiKey: API_CONFIG.apiKey,

        nodeInfoList: [

          {

            nodeId: "80",

            fieldName: "image",

            fieldValue: modelHash,

            description: "Upload model"

          },

          {

            nodeId: "102",

            fieldName: "value",

            fieldValue: "2", // Always use Fast mode

            description: "1 Fine 2 Fast"

          },

          {

            nodeId: "104",

            fieldName: "image",

            fieldValue: clothingHash,

            description: "Upload clothing"

          }

        ]

      };

      console.log('Sending payload:', JSON.stringify(payload, null, 2));

      // Add retry logic for network errors
      let response;
      let lastError;
      const maxRetries = 3;
      
      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          response = await fetch(API_CONFIG.url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
              // Note: Host header is set to 'www.runninghub.ai' in curl but cannot be set in browser fetch - 
              // browser automatically sets it to the domain in the URL (www.runninghub.ai)
            },
            body: JSON.stringify(payload)
          });
          
          // If we got a response, break out of retry loop
          break;
        } catch (networkError) {
          lastError = networkError;
          console.warn(`Network error (attempt ${retry + 1}/${maxRetries}):`, networkError.message);
          
          if (retry < maxRetries - 1) {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
            continue;
          } else {
            throw new Error(`Network error after ${maxRetries} attempts: ${networkError.message}`);
          }
        }
      }

      if (!response) {
        throw lastError || new Error('Failed to get response from server');
      }

      // Check if response is ok before parsing JSON
      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        throw new Error(errorData.msg || errorData.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Log the full response structure for debugging
      console.log('API Response:', JSON.stringify(data, null, 2));



      // Check for error response FIRST (API returns HTTP 200 but with error code in body)
      // Check for error response (code 433 or other error codes)
      if (data.code && data.code !== 200 && data.code !== 0) {
        // Parse the error message if it's a JSON string
        let errorMessage = data.msg || data.message || 'Unknown error';
        
        try {
          // The msg field might be a JSON string that needs parsing
          const parsedMsg = JSON.parse(errorMessage);
          if (parsedMsg.error) {
            errorMessage = parsedMsg.error.message || parsedMsg.error.details || errorMessage;
          }
          // Check for node errors - this is where the actual error details are
          if (parsedMsg.node_errors) {
            const nodeErrors = Object.values(parsedMsg.node_errors);
            if (nodeErrors.length > 0 && nodeErrors[0].errors) {
              const firstError = nodeErrors[0].errors[0];
              errorMessage = firstError.details || firstError.message || errorMessage;
            }
          }
        } catch (e) {
          // If parsing fails, use the original message
          console.log('Error message is not JSON, using as-is');
        }
        
        throw new Error(errorMessage);
      }

      // Check HTTP status code
      if (!response.ok) {

        throw new Error(data.message || data.error || data.msg || `API Error: ${response.status} ${response.statusText}`);

      }



      // Handle different possible response structures
      // Common patterns: data.resultUrl, data.url, data.data.resultUrl, data.result, etc.
      
      let imageUrl = null;

      // Try to extract image URL from various possible response structures
      if (data.data) {
        // Check nested data structures
        if (data.data.resultUrl) {
          imageUrl = data.data.resultUrl;
        } else if (data.data.result) {
          imageUrl = typeof data.data.result === 'string' ? data.data.result : (data.data.result.url || data.data.result.resultUrl);
        } else if (data.data.url) {
          imageUrl = data.data.url;
        } else if (data.data.imageUrl) {
          imageUrl = data.data.imageUrl;
        } else if (data.data.image) {
          imageUrl = typeof data.data.image === 'string' ? data.data.image : (data.data.image.url || data.data.image.resultUrl);
        } else if (Array.isArray(data.data) && data.data.length > 0) {
          // If it's an array, try to find a URL in the first item or search through items
          const firstItem = data.data[0];
          if (typeof firstItem === 'string') {
            imageUrl = firstItem;
          } else if (firstItem && (firstItem.url || firstItem.resultUrl || firstItem.imageUrl)) {
            imageUrl = firstItem.url || firstItem.resultUrl || firstItem.imageUrl;
          } else {
            // Search through array for URL
            const urlItem = data.data.find(item => 
              (typeof item === 'string' && item.startsWith('http')) ||
              (item && (item.url || item.resultUrl || item.imageUrl))
            );
            if (urlItem) {
              imageUrl = typeof urlItem === 'string' ? urlItem : (urlItem.url || urlItem.resultUrl || urlItem.imageUrl);
            }
          }
        } else if (typeof data.data === 'string' && data.data.startsWith('http')) {
          imageUrl = data.data;
        } else if (data.data.taskId || data.data.taskStatus) {
          // If response contains taskId or taskStatus, it's an async task - need to poll
          const taskId = data.data.taskId;
          const clientId = data.data.clientId;
          const taskStatus = data.data.taskStatus;
          
          // Extract and store total nodes from promptTips for progress tracking
          if (data.data.promptTips) {
            try {
              const promptTips = typeof data.data.promptTips === 'string' 
                ? JSON.parse(data.data.promptTips) 
                : data.data.promptTips;
              
              if (promptTips.outputs_to_execute && Array.isArray(promptTips.outputs_to_execute)) {
                totalNodesRef.current = promptTips.outputs_to_execute.length;
                console.log(`Total nodes to execute: ${totalNodesRef.current}`, promptTips.outputs_to_execute);
                // Set initial progress
                setProgress({ value: 0, max: totalNodesRef.current });
              }
            } catch (e) {
              console.warn('Failed to parse promptTips for node count:', e);
            }
          }
          
          if (taskStatus === 'SUCCESS' || taskStatus === 'COMPLETED') {
            // Already completed, try to extract result
            if (data.data.resultUrl) {
              imageUrl = data.data.resultUrl;
            } else if (data.data.result) {
              imageUrl = typeof data.data.result === 'string' ? data.data.result : (data.data.result.url || data.data.result.resultUrl);
            } else if (data.data.url) {
              imageUrl = data.data.url;
            }
          } else if (taskStatus === 'RUNNING' || taskStatus === 'QUEUED' || taskStatus === 'CREATE') {
            // Task is running/queued, poll for status (try WebSocket first, then HTTP polling)
            console.log(`Task status: ${taskStatus}, starting to poll for results...`);
            try {
              const wsUrl = data.data.netWssUrl;
              const result = await pollTaskStatus(taskId, clientId, wsUrl);
              if (typeof result === 'string' && result.startsWith('http')) {
                imageUrl = result;
              } else if (result && typeof result === 'object') {
                // Result is an object, try to extract URL
                imageUrl = result.resultUrl || result.url || result.imageUrl || 
                          (result.result && (typeof result.result === 'string' ? result.result : (result.result.url || result.result.resultUrl))) ||
                          (result.output && (typeof result.output === 'string' ? result.output : (result.output.url || result.output.resultUrl || result.output.filename)));
              }
            } catch (pollError) {
              throw new Error(`Failed to get task result: ${pollError.message}`);
            }
          } else if (taskStatus === 'FAILED') {
            throw new Error(data.data.error || data.msg || 'Task failed');
          }
        }
      } 
      
      // Check top-level properties
      if (!imageUrl) {
        if (data.resultUrl) {
          imageUrl = data.resultUrl;
        } else if (data.url) {
          imageUrl = data.url;
        } else if (data.imageUrl) {
          imageUrl = data.imageUrl;
        } else if (data.result) {
          imageUrl = typeof data.result === 'string' ? data.result : (data.result.url || data.result.resultUrl);
        } else if (data.image) {
          imageUrl = typeof data.image === 'string' ? data.image : (data.image.url || data.image.resultUrl);
        }
      }

      if (imageUrl) {
        setProgress({ value: 100, max: 100 }); // Set to 100% on completion
        setGeneratedImage(imageUrl);
      } else {
        // Log the full structure to help debug
        console.error('Could not find image URL in response. Full response structure:', JSON.stringify(data, null, 2));
        throw new Error('API response does not contain an image URL. Check console for full response details.');
      }



    } catch (err) {

      console.error('Generation error:', err);

      setError(`Failed to generate: ${err.message}. Please check the console for more details.`);
      setProgress({ value: 0, max: 100 }); // Reset progress on error

    } finally {

      setLoading(false);

    }

  };



  const handleDownload = async () => {

    if (!generatedImage) return;

    try {

      const response = await fetch(generatedImage);

      const blob = await response.blob();

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');

      link.href = url;

      link.download = `ootd-generated-${Date.now()}.png`;

      document.body.appendChild(link);

      link.click();

      document.body.removeChild(link);

    } catch (e) {

      console.error('Download failed', e);

      // Fallback for cross-origin images

      window.open(generatedImage, '_blank');

    }

  };



  const handleShare = async () => {

    if (navigator.share && generatedImage) {

      try {

        await navigator.share({

          title: 'My AI OOTD',

          text: 'Check out my AI generated outfit!',

          url: generatedImage,

        });

      } catch (err) {

        console.log('Error sharing:', err);

      }

    } else {

      // Fallback: Copy to clipboard

      navigator.clipboard.writeText(generatedImage);

      alert('Image URL copied to clipboard!');

    }

  };



  return (

    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans selection:bg-purple-100">

      

      {/* Header */}

      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-200">

        <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">

          <div className="flex items-center gap-2">

            <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">

              Ai

            </div>

            <h1 className="text-xl font-bold tracking-tight text-neutral-900">OOTD Gen</h1>

          </div>

          <a href="#" className="text-sm font-medium text-purple-600 hover:text-purple-700">

            History

          </a>

        </div>

      </header>

      {/* Preview Section */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-md mx-auto px-4 py-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3 text-center">How it works</h2>
          <div className="w-full rounded-xl overflow-hidden shadow-sm border border-neutral-200">
            <img 
              src="/preview.jpg" 
              alt="OOTD Generator Preview - Character, Clothes, and Try-on" 
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </section>

      <main className="max-w-md mx-auto px-4 py-6 pb-24">

        

        {/* Error Message */}

        {error && (

          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-red-700 text-sm">

            <AlertCircle className="w-5 h-5 shrink-0" />

            <p>{error}</p>

          </div>

        )}



        {/* Generated Result View */}

        {generatedImage ? (

          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

            <div className="aspect-[3/4] w-full bg-neutral-100 rounded-2xl overflow-hidden shadow-lg border border-neutral-200 relative group">

              <img 

                src={generatedImage} 

                alt="AI Generated OOTD" 

                className="w-full h-full object-cover"

              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">

                <p className="text-white text-sm font-medium">Generated successfully</p>

              </div>

            </div>



            <div className="mt-6 flex gap-3">

              <button 

                onClick={handleDownload}

                className="flex-1 h-12 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl font-medium flex items-center justify-center gap-2 transition-colors active:scale-95 transform duration-100"

              >

                <Download className="w-5 h-5" />

                Download

              </button>

              <button 

                onClick={handleShare}

                className="flex-1 h-12 bg-white border border-neutral-200 hover:bg-neutral-50 text-neutral-900 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors active:scale-95 transform duration-100"

              >

                <Share2 className="w-5 h-5" />

                Share

              </button>

            </div>



            <button 

              onClick={() => {

                setGeneratedImage(null);

                setModelPreview(null);
                setModelFile(null);
                setClothingPreview(null);
                setClothingFile(null);

              }}

              className="w-full mt-4 h-12 text-neutral-500 font-medium hover:text-neutral-900 flex items-center justify-center gap-2"

            >

              <RefreshCw className="w-4 h-4" />

              Generate New Outfit

            </button>

          </div>

        ) : (

          /* Input / Upload View */

          <div className="space-y-6">

            

            {/* Upload Areas */}
            <div className="space-y-6">

              {/* Model Upload */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-neutral-700">Upload Model</h3>
                <div 
                  onClick={() => triggerFileSelect('model')}
                  className={`
                    relative aspect-[3/4] w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden
                    ${modelPreview ? 'border-purple-500 bg-purple-50' : 'border-neutral-300 hover:border-purple-400 hover:bg-neutral-50'}
                  `}
                >
                  <input 
                    type="file" 
                    ref={modelInputRef}
                    onChange={(e) => handleFileSelect('model', e)}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {modelPreview ? (
                    <>
                      <img 
                        src={modelPreview} 
                        alt="Model preview" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-sm font-medium shadow-sm">
                          Change Photo
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3">
                      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center">
                        <Upload className="w-6 h-6 text-purple-600" />
                      </div>
                      <p className="text-sm font-medium text-neutral-900">Tap to upload</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Clothing Upload */}
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-neutral-700">Upload Clothing</h3>
                <div 
                  onClick={() => triggerFileSelect('clothing')}
                  className={`
                    relative aspect-[3/4] w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden
                    ${clothingPreview ? 'border-purple-500 bg-purple-50' : 'border-neutral-300 hover:border-purple-400 hover:bg-neutral-50'}
                  `}
                >
                  <input 
                    type="file" 
                    ref={clothingInputRef}
                    onChange={(e) => handleFileSelect('clothing', e)}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  {clothingPreview ? (
                    <>
                      <img 
                        src={clothingPreview} 
                        alt="Clothing preview" 
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-sm font-medium shadow-sm">
                          Change Photo
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-400 gap-3">
                      <div className="w-12 h-12 bg-white rounded-full shadow-sm flex items-center justify-center">
                        <Upload className="w-6 h-6 text-purple-600" />
                      </div>
                      <p className="text-sm font-medium text-neutral-900">Tap to upload</p>
                    </div>
                  )}
                </div>
              </div>

            </div>



            {/* Action Button */}

            <button

              onClick={handleGenerate}

              disabled={loading || !modelFile || !clothingFile}

              className={`

                w-full ${loading ? 'min-h-14 py-4' : 'h-14'} rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] duration-200

                ${loading || !modelFile || !clothingFile 

                  ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed' 

                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/25'}

              `}

            >

              {loading ? (

                <div className="flex flex-col items-center gap-3 w-full">

                  <div className="flex items-center gap-3">

                    <Loader2 className="w-6 h-6 animate-spin" />

                    <span>Generating Outfit...</span>

                  </div>

                </div>

              ) : (

                'Generate OOTD'

              )}

            </button>



            {/* Progress Bar */}
            {loading && progress.max > 0 && (
              <div className="w-full mt-4 space-y-3">
                <div className="relative w-full">
                  {/* Progress Bar Track */}
                  <div className="w-full h-3 bg-neutral-800 rounded-full overflow-hidden shadow-inner">
                    {/* Progress Fill with Gradient */}
                    <div 
                      className="h-full bg-gradient-to-r from-purple-500 via-purple-400 to-purple-300 rounded-full transition-all duration-300 ease-out relative"
                      style={{ width: `${Math.min((progress.value / progress.max) * 100, 100)}%` }}
                    >
                      {/* Subtle texture effect */}
                      <div className="absolute inset-0 opacity-20 bg-gradient-to-b from-white/10 to-transparent"></div>
                    </div>
                  </div>
                  
                  {/* Speech Bubble with Percentage */}
                  <div 
                    className="absolute -top-9 left-0 transition-all duration-300 ease-out pointer-events-none"
                    style={{ 
                      left: `clamp(0px, calc(${Math.min((progress.value / progress.max) * 100, 100)}% - 28px), calc(100% - 56px))` 
                    }}
                  >
                    <div className="relative">
                      {/* Speech Bubble */}
                      <div className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-lg shadow-lg border border-purple-200/50 whitespace-nowrap">
                        <span className="text-sm font-semibold">
                          {Math.round((progress.value / progress.max) * 100)}%
                        </span>
                      </div>
                      {/* Speech Bubble Tail */}
                      <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-purple-50"></div>
                    </div>
                  </div>
                </div>
                
                {progress.value < progress.max && (
                  <p className="text-xs text-center text-neutral-500">
                    {progress.value} of {progress.max} steps completed
                  </p>
                )}
              </div>
            )}



            <p className="text-xs text-center text-neutral-400 px-8">

              By generating, you agree to our Terms of Service. 

              Results may vary based on photo quality.

            </p>



          </div>

        )}

      </main>

    </div>

  );

}

