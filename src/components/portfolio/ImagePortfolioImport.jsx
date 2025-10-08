
import React, { useState, useEffect } from 'react';
import { Upload, Camera, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { UploadFile, ExtractDataFromUploadedFile } from '@/integrations/Core';
import { Asset } from '@/entities/Asset';
import AutocompleteInput from '../ui/AutocompleteInput';

export default function ImagePortfolioImport({ onSuccess }) {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [showBrokerInput, setShowBrokerInput] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uniqueBrokers, setUniqueBrokers] = useState([]);

  useEffect(() => {
    const fetchBrokers = async () => {
      try {
        const allAssets = await Asset.list();
        const brokers = [...new Set(allAssets.map(a => a.broker).filter(Boolean))];
        setUniqueBrokers(brokers);
      } catch (err) {
        console.error("Failed to fetch existing brokers:", err);
        // Optionally set an error state here if needed, but not critical for this component's main flow
      }
    };
    fetchBrokers();
  }, []);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      prepareFileForProcessing(files[0]);
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files[0]) {
      prepareFileForProcessing(files[0]);
    }
  };

  const prepareFileForProcessing = (file) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, etc.)');
      return;
    }
    
    setUploadedFile(file);
    setShowBrokerInput(true);
    setError(''); // Clear previous error
  };

  const handleProcessFile = async () => {
    if (!uploadedFile || !brokerName.trim()) {
      setError('Please provide a broker name');
      return;
    }

    setIsProcessing(true);
    setError('');
    setResults(null);

    try {
      setProcessingStep('Uploading image...');
      const { file_url } = await UploadFile({ file: uploadedFile });

      setProcessingStep('Analyzing image with AI...');
      
      const assetSchema = {
        type: "object",
        properties: {
          assets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                symbol: { type: "string", description: "Stock/asset symbol (e.g., AAPL, TSLA)" },
                name: { type: "string", description: "Full company or asset name" },
                quantity: { type: "number", description: "Number of shares owned" },
                current_price: { type: "number", description: "Current price per share" },
                market_value: { type: "number", description: "Total market value" },
                type: { 
                  type: "string", 
                  enum: ["stock", "etf", "crypto", "bond", "mutual_fund"],
                  description: "Type of asset"
                },
                gain_loss: { type: "number", description: "Gain/loss amount if visible" },
                gain_loss_percent: { type: "number", description: "Gain/loss percentage if visible" }
              },
              required: ["symbol", "name", "quantity", "current_price", "market_value", "type"]
            }
          }
        },
        required: ["assets"]
      };

      const extraction = await ExtractDataFromUploadedFile({
        file_url,
        json_schema: assetSchema
      });

      if (extraction.status === 'error') {
        throw new Error(extraction.details || 'Failed to analyze image');
      }

      const extractedData = extraction.output;
      if (!extractedData?.assets || extractedData.assets.length === 0) {
        throw new Error('No assets found in the image. Please make sure the image clearly shows your portfolio holdings.');
      }

      setProcessingStep('Updating portfolio...');
      
      // Fetch existing assets to perform smart updates
      const existingAssets = await Asset.list();
      let createdCount = 0;
      let updatedCount = 0;

      for (const extractedAsset of extractedData.assets) {
        const existingAsset = existingAssets.find(a => a.symbol === extractedAsset.symbol && a.broker === brokerName.trim());

        // Sanitize data and calculate missing fields
        const assetPayload = {
          ...extractedAsset,
          broker: brokerName.trim(),
          purchase_price: extractedAsset.purchase_price || extractedAsset.current_price,
        };

        if (existingAsset) {
          // Update existing asset
          await Asset.update(existingAsset.id, assetPayload);
          updatedCount++;
        } else {
          // Create new asset
          await Asset.create(assetPayload);
          createdCount++;
        }
      }

      setProcessingStep('Complete!');
      setResults({ created: createdCount, updated: updatedCount, total: extractedData.assets.length });

    } catch (err) {
      console.error(err);
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsProcessing(false);
      setProcessingStep('');
    }
  };

  const handleBrokerChange = (valueOrEvent) => {
    if (typeof valueOrEvent === 'string') {
      setBrokerName(valueOrEvent);
      return;
    }
    const nextValue = valueOrEvent?.target?.value ?? '';
    setBrokerName(nextValue);
  };

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
        <p className="font-semibold text-purple-800 text-lg">Processing...</p>
        <p className="text-sm text-purple-600">{processingStep}</p>
      </div>
    );
  }

  if (results) {
    return (
      <div className="neomorph-inset bg-green-50 text-green-800 rounded-2xl p-6 text-left">
        <div className="flex items-start space-x-3">
          <CheckCircle className="w-6 h-6 flex-shrink-0" />
          <div>
            <p className="font-semibold mb-2">Import Successful!</p>
            <p className="text-sm">
              Successfully imported {results.total} assets to {brokerName}.
            </p>
            <ul className="text-sm mt-2 list-disc list-inside">
              {results.created > 0 && <li>{results.created} new assets added.</li>}
              {results.updated > 0 && <li>{results.updated} existing assets updated.</li>}
            </ul>
            <button 
              onClick={onSuccess}
              className="mt-4 neomorph bg-green-100 rounded-lg px-4 py-2 text-sm font-medium neomorph-hover"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showBrokerInput) {
    return (
      <div className="space-y-6 text-center">
        <div>
          <h3 className="text-xl font-bold text-purple-900 mb-2">Enter Broker Information</h3>
          <p className="text-purple-700">Please specify the broker name for this portfolio import.</p>
        </div>

        {error && (
          <div className="flex items-start space-x-3 bg-red-100 p-4 rounded-xl text-left">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <AutocompleteInput
            value={brokerName}
            onChange={handleBrokerChange}
            suggestions={uniqueBrokers}
            placeholder="e.g., Interactive Brokers"
            className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent text-center"
            required
            name="brokerName"
          />
        </div>

        <div className="flex justify-center space-x-4">
          <button
            onClick={() => {
              setShowBrokerInput(false);
              setUploadedFile(null);
              setBrokerName('');
              setError(''); // Clear error on cancel
            }}
            className="neomorph rounded-xl px-6 py-3 font-semibold text-purple-700 neomorph-hover transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleProcessFile}
            disabled={!brokerName.trim()}
            className="neomorph rounded-xl px-6 py-3 font-semibold text-purple-800 neomorph-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Import Portfolio
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-start space-x-3 bg-red-100 p-4 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      <div 
        onDragEnter={handleDrag} 
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-purple-600 bg-purple-100' : 'border-purple-300'}`}
      >
        <input 
          type="file" 
          id="image-upload" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
          onChange={handleFileInput}
          accept="image/png, image/jpeg, image/jpg"
        />
        <label htmlFor="image-upload" className="cursor-pointer">
          <Camera className="w-8 h-8 mx-auto text-purple-500 mb-3" />
          <p className="font-semibold text-purple-700">
            {uploadedFile ? uploadedFile.name : 'Click to upload or drag & drop'}
          </p>
          <p className="text-xs text-purple-600">PNG, JPG, JPEG formats</p>
        </label>
      </div>

      <div className="neomorph-inset rounded-xl p-4">
        <h4 className="font-semibold text-purple-800 mb-2 flex items-center"><Camera className="w-4 h-4 mr-2"/>Photo Tips</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-purple-700">
          <li>Make sure asset symbols and quantities are clearly visible</li>
          <li>Good lighting helps with accuracy</li>
          <li>Screenshots work better than photos of screens</li>
        </ul>
      </div>
    </div>
  );
}
