import React, { useState, useRef, useEffect, useCallback } from 'react';

import { Upload, Share2, Download, Image as ImageIcon, Loader2, RefreshCw, AlertCircle, Check, X, ArrowRight } from 'lucide-react';

import { API_CONFIG, checkTaskStatus, getTaskOutputs, pollTaskStatus, pollTaskStatusHttp, uploadFile, getAccountStatus } from './api';



export default function App() {
  // Default clothing image - use base URL for GitHub Pages compatibility
  const BASE_URL = import.meta.env.BASE_URL;
  const DEFAULT_CLOTHING_IMAGE = `${BASE_URL}default/clothes.jpg`;

  const [modelFile, setModelFile] = useState(null);
  const [modelPreview, setModelPreview] = useState(null);
  
  const [clothingFile, setClothingFile] = useState(null);
  const [clothingPreview, setClothingPreview] = useState(DEFAULT_CLOTHING_IMAGE);

  const [generatedImage, setGeneratedImage] = useState(null);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  const [progress, setProgress] = useState({ value: 0, max: 100 });

  

  // Configuration State



  const modelInputRef = useRef(null);
  const clothingInputRef = useRef(null);
  const taskStartTimeRef = useRef(null); // Store task start time for progress calculation
  
  // Tour/Onboarding state
  const [showTour, setShowTour] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const modelUploadRef = useRef(null);
  const clothingUploadRef = useRef(null);
  const generateButtonRef = useRef(null);
  
  // Tour steps configuration
  const tourSteps = [
    {
      title: 'Welcome to OOTD Gen! 👋',
      description: 'Create AI-generated outfit try-ons in seconds. Let\'s get started!',
      target: null,
      position: 'center'
    },
    {
      title: 'Step 1: Upload Your Photo',
      description: 'Tap here to upload a photo of yourself or a model. This will be the base for your outfit try-on.',
      target: modelUploadRef,
      position: 'bottom'
    },
    {
      title: 'Step 2: Upload Clothing (Optional)',
      description: 'Upload a photo of the clothing item you want to try on. If you skip this, we\'ll use a default outfit.',
      target: clothingUploadRef,
      position: 'bottom'
    },
    {
      title: 'Step 3: Generate Your Outfit',
      description: 'Once you\'ve uploaded your photo, click here to generate your AI outfit try-on. It usually takes about 2-3 minutes.',
      target: generateButtonRef,
      position: 'top'
    }
  ];
  
  // Check if user has seen the tour before
  useEffect(() => {
    const hasSeenTour = localStorage.getItem('ootd-tour-completed');
    if (!hasSeenTour) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        setShowTour(true);
        // Scroll to first step if it has a target
        if (tourSteps[0].target?.current) {
          setTimeout(() => {
            tourSteps[0].target.current.scrollIntoView({
              behavior: 'smooth',
              block: 'center'
            });
          }, 300);
        }
      }, 500);
    }
  }, []);
  
  const handleTourNext = () => {
    if (tourStep < tourSteps.length - 1) {
      const nextStep = tourStep + 1;
      setTourStep(nextStep);
      
      // Scroll to the target element if it exists
      if (tourSteps[nextStep].target?.current) {
        setTimeout(() => {
          tourSteps[nextStep].target.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }, 100);
      }
    } else {
      handleTourComplete();
    }
  };
  
  const handleTourSkip = () => {
    handleTourComplete();
  };
  
  const handleTourComplete = () => {
    setShowTour(false);
    localStorage.setItem('ootd-tour-completed', 'true');
  };
  
  // Function to reset and show tour (for testing)
  const resetTour = useCallback(() => {
    localStorage.removeItem('ootd-tour-completed');
    setTourStep(0);
    setShowTour(true);
    // Scroll to first step if it has a target
    setTimeout(() => {
      if (tourSteps[0].target?.current) {
        tourSteps[0].target.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
    }, 300);
  }, []);
  
  // Expose resetTour to window for console access
  useEffect(() => {
    window.resetOOTDTour = resetTour;
    return () => {
      delete window.resetOOTDTour;
    };
  }, [resetTour]);
  
  // Keyboard shortcut to reset tour (press 'T' key)
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Press 'T' key to reset tour (only when not typing in an input)
      if (e.key === 't' || e.key === 'T') {
        const target = e.target;
        const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!isInput && !showTour) {
          resetTour();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [showTour, resetTour]);



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






  const handleGenerate = async () => {
    // Require model image to be uploaded
    if (!modelFile) {
      setError('Please upload a model image.');
      return;
    }

    // Use default clothing image if no file is selected
    let clothingImageToUse = clothingFile;
    if (!clothingFile) {
      try {
        const response = await fetch(DEFAULT_CLOTHING_IMAGE);
        const blob = await response.blob();
        clothingImageToUse = new File([blob], 'clothes.jpg', { type: 'image/jpeg' });
      } catch (err) {
        setError('Failed to load default clothing image.');
        return;
      }
    }

    const modelImageToUse = modelFile;



    setLoading(true);

    setError('');

    setProgress({ value: 0, max: 100 });
    taskStartTimeRef.current = Date.now(); // Record start time for progress calculation



    try {
      // Check account status to see if we can start a new task
      console.log('Checking account status...');
      const accountStatus = await getAccountStatus();
      const currentTaskCounts = accountStatus.currentTaskCounts;
      
      console.log(`Current task counts: ${currentTaskCounts}`);
      
      // If currentTaskCounts is 3 or more, forbid generating new request
      if (currentTaskCounts >= 3) {
        setLoading(false);
        setError(`Cannot generate new request. You have ${currentTaskCounts} tasks currently running. Please wait until some tasks complete (maximum 3 concurrent tasks allowed).`);
        return;
      }

      // Upload both files to get their hashes
      console.log('Uploading model image...');
      const modelHash = await uploadFile(modelImageToUse);
      console.log('Model hash obtained:', modelHash);
      
      console.log('Uploading clothing image...');
      const clothingHash = await uploadFile(clothingImageToUse);
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
            // Task is running/queued, poll for status using HTTP polling
            console.log(`Task status: ${taskStatus}, starting to poll for results...`);
            try {
              const wsUrl = data.data.netWssUrl; // Not used anymore, but kept for compatibility
              const result = await pollTaskStatus(taskId, clientId, wsUrl, 120, 2000, setProgress, taskStartTimeRef);
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

              OOTD

            </div>

            <h1 className="text-xl font-bold tracking-tight text-neutral-900">OOTD(Beta)</h1>

          </div>

        </div>

      </header>

      {/* Preview Section */}
      <section className="bg-white border-b border-neutral-200">
        <div className="max-w-md mx-auto px-4 py-6">
          <h2 className="text-sm font-semibold text-neutral-700 mb-3 text-center">How it works</h2>
          <div className="w-full rounded-xl overflow-hidden shadow-sm border border-neutral-200">
            <img 
              src={`${BASE_URL}preview.jpg`}
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
                setClothingPreview(DEFAULT_CLOTHING_IMAGE);
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
              <div className="space-y-2" ref={modelUploadRef}>
                <h3 className="text-sm font-medium text-neutral-700">Upload Model</h3>
                <div 
                  onClick={() => triggerFileSelect('model')}
                  className={`
                    relative aspect-[3/4] w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden flex items-center justify-center
                    ${modelFile ? 'border-purple-500 bg-purple-50' : 'border-neutral-300 hover:border-purple-400 hover:bg-neutral-50'}
                    ${showTour && tourStep === 1 ? 'ring-4 ring-purple-500 ring-offset-2' : ''}
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
                    <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
                      <ImageIcon className="w-12 h-12 text-neutral-400" />
                      <div>
                        <p className="text-sm font-medium text-neutral-700">Upload your image</p>
                        <p className="text-xs text-neutral-500 mt-1">Tap to select a photo</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Clothing Upload */}
              <div className="space-y-2" ref={clothingUploadRef}>
                <h3 className="text-sm font-medium text-neutral-700">Upload Clothing</h3>
                <div 
                  onClick={() => triggerFileSelect('clothing')}
                  className={`
                    relative aspect-[3/4] w-full rounded-2xl border-2 border-dashed transition-all duration-200 cursor-pointer overflow-hidden
                    ${clothingFile ? 'border-purple-500 bg-purple-50' : 'border-neutral-300 hover:border-purple-400 hover:bg-neutral-50'}
                    ${showTour && tourStep === 2 ? 'ring-4 ring-purple-500 ring-offset-2' : ''}
                  `}
                >
                  <input 
                    type="file" 
                    ref={clothingInputRef}
                    onChange={(e) => handleFileSelect('clothing', e)}
                    accept="image/*"
                    className="hidden"
                  />
                  
                  <img 
                    src={clothingPreview} 
                    alt="Clothing preview" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <div className="bg-white/90 backdrop-blur px-4 py-2 rounded-full text-sm font-medium shadow-sm">
                      {clothingFile ? 'Change Photo' : 'Tap to upload'}
                    </div>
                  </div>
                </div>
              </div>

            </div>



            {/* Action Button */}

            <button

              ref={generateButtonRef}

              onClick={handleGenerate}

              disabled={loading || !modelFile}

              className={`

                w-full ${loading ? 'min-h-14 py-4' : 'h-14'} rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] duration-200

                ${loading || !modelFile

                  ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed' 

                  : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/25'}

                ${showTour && tourStep === 3 ? 'ring-4 ring-purple-500 ring-offset-2' : ''}

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
                    {progress.value}% complete • Estimated time: {Math.max(0, Math.ceil(180 - (progress.value / 100 * 180)))}s remaining
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

      {/* Tour Overlay */}
      {showTour && (() => {
        // Calculate position and determine actual placement
        const getCalloutPosition = () => {
          if (!tourSteps[tourStep].target?.current) {
            return {
              style: {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: '400px'
              },
              arrowDirection: null
            };
          }
          
          const rect = tourSteps[tourStep].target.current.getBoundingClientRect();
          const position = tourSteps[tourStep].position;
          const calloutHeight = 220; // Estimated height of callout
          const padding = 16;
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          
          if (position === 'center') {
            return {
              style: {
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: '400px'
              },
              arrowDirection: null
            };
          } else if (position === 'bottom') {
            // Check if there's enough space below
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;
            const useTop = spaceBelow < calloutHeight + padding && spaceAbove > spaceBelow;
            
            const left = Math.max(padding, Math.min(rect.left + (rect.width / 2), viewportWidth - padding));
            const maxWidth = Math.min(320, viewportWidth - (padding * 2));
            
            if (useTop) {
              // Position above if not enough space below
              return {
                style: {
                  bottom: `${viewportHeight - rect.top + padding}px`,
                  left: `${left}px`,
                  transform: 'translateX(-50%)',
                  width: '90%',
                  maxWidth: `${maxWidth}px`
                },
                arrowDirection: 'down' // Arrow points down to element
              };
            } else {
              // Position below
              const top = Math.min(rect.bottom + padding, viewportHeight - calloutHeight - padding);
              return {
                style: {
                  top: `${top}px`,
                  left: `${left}px`,
                  transform: 'translateX(-50%)',
                  width: '90%',
                  maxWidth: `${maxWidth}px`
                },
                arrowDirection: 'up' // Arrow points up to element
              };
            }
          } else if (position === 'top') {
            // Check if there's enough space above
            const spaceAbove = rect.top;
            const spaceBelow = viewportHeight - rect.bottom;
            const useBottom = spaceAbove < calloutHeight + padding && spaceBelow > spaceAbove;
            
            const left = Math.max(padding, Math.min(rect.left + (rect.width / 2), viewportWidth - padding));
            const maxWidth = Math.min(320, viewportWidth - (padding * 2));
            
            if (useBottom) {
              // Position below if not enough space above
              const top = Math.min(rect.bottom + padding, viewportHeight - calloutHeight - padding);
              return {
                style: {
                  top: `${top}px`,
                  left: `${left}px`,
                  transform: 'translateX(-50%)',
                  width: '90%',
                  maxWidth: `${maxWidth}px`
                },
                arrowDirection: 'up' // Arrow points up to element
              };
            } else {
              // Position above
              const bottom = Math.min(window.innerHeight - rect.top + padding, viewportHeight - padding);
              return {
                style: {
                  bottom: `${bottom}px`,
                  left: `${left}px`,
                  transform: 'translateX(-50%)',
                  width: '90%',
                  maxWidth: `${maxWidth}px`
                },
                arrowDirection: 'down' // Arrow points down to element
              };
            }
          }
          return { style: {}, arrowDirection: null };
        };
        
        const { style: calloutStyle, arrowDirection } = getCalloutPosition();
        
        return (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity duration-300"
              onClick={handleTourSkip}
            />
            
            {/* Tour Callout */}
            <div 
              className="fixed z-50 transition-all duration-300"
              style={calloutStyle}
            >
            <div className="bg-white rounded-2xl shadow-2xl p-6 relative animate-in fade-in slide-in-from-bottom-4">
              {/* Close button */}
              <button
                onClick={handleTourSkip}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
                aria-label="Skip tour"
              >
                <X className="w-4 h-4" />
              </button>
              
              {/* Content */}
              <div className="pr-8">
                <h3 className="text-xl font-bold text-neutral-900 mb-2">
                  {tourSteps[tourStep].title}
                </h3>
                <p className="text-sm text-neutral-600 leading-relaxed mb-6">
                  {tourSteps[tourStep].description}
                </p>
                
                {/* Progress indicator */}
                <div className="flex items-center gap-2 mb-4">
                  {tourSteps.map((_, index) => (
                    <div
                      key={index}
                      className={`h-1.5 flex-1 rounded-full transition-all ${
                        index <= tourStep ? 'bg-purple-600' : 'bg-neutral-200'
                      }`}
                    />
                  ))}
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={handleTourSkip}
                    className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    Skip Tour
                  </button>
                  <button
                    onClick={handleTourNext}
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium flex items-center gap-2 transition-colors active:scale-95 transform duration-100"
                  >
                    {tourStep === tourSteps.length - 1 ? 'Get Started' : 'Next'}
                    {tourStep < tourSteps.length - 1 && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              
              {/* Arrow pointer for non-center positions */}
              {arrowDirection && (
                <div 
                  className="absolute w-0 h-0"
                  style={{
                    ...(arrowDirection === 'down' ? {
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      borderLeft: '12px solid transparent',
                      borderRight: '12px solid transparent',
                      borderBottom: '12px solid white'
                    } : {
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      borderLeft: '12px solid transparent',
                      borderRight: '12px solid transparent',
                      borderTop: '12px solid white'
                    })
                  }}
                />
              )}
            </div>
          </div>
        </>
      );
      })()}

    </div>

  );

}

