
import React, { useState, useEffect } from 'react';
import { Upload, File, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { UploadFile, ExtractDataFromUploadedFile, FetchPriceDetails } from '@/integrations/Core';
import { Asset } from '@/entities/Asset';
import AutocompleteInput from '../ui/AutocompleteInput';

export default function CSVPortfolioImport({ onSuccess }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [brokerName, setBrokerName] = useState('');
  const [uniqueBrokers, setUniqueBrokers] = useState([]);

  useEffect(() => {
    const fetchBrokers = async () => {
      const allAssets = await Asset.list();
      // Filter out any assets that might not have a broker name (e.g., null, undefined, empty string)
      const brokers = [...new Set(allAssets.map(a => a.broker).filter(Boolean))]; 
      setUniqueBrokers(brokers);
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
      setFile(files[0]);
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files && files[0]) {
      setFile(files[0]);
    }
  };

  const handleBrokerChange = (value) => { // AutocompleteInput passes the value directly, not an event
    setBrokerName(value);
  };

  const handleProcessFile = async () => {
    if (!file || !brokerName.trim()) {
      setError('Please select a file and enter a broker name.');
      return;
    }

    setIsProcessing(true);
    setError('');
    setResults(null);

    try {
      setProcessingStep('Uploading CSV...');
      const { file_url } = await UploadFile({ file });

      setProcessingStep('Analyzing CSV with AI...');
      
      const assetSchema = {
        type: "object",
        properties: {
          assets: {
            type: "array",
            items: {
              type: "object",
              properties: {
                symbol: { type: "string" },
                name: { type: "string" },
                quantity: { type: "number" },
                current_price: { type: "number" },
                market_value: { type: "number" },
                purchase_price: { type: "number" },
                type: { type: "string", enum: ["stock", "etf", "crypto", "bond", "mutual_fund"] }
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
        throw new Error(extraction.details || 'Failed to analyze CSV');
      }

      const extractedData = extraction.output;
      if (!extractedData?.assets || extractedData.assets.length === 0) {
        throw new Error('No assets found in the file. Please make sure the CSV contains asset data with clear headers.');
      }

      setProcessingStep('Updating portfolio...');
      
      const existingAssets = await Asset.list();
      let createdCount = 0;
      let updatedCount = 0;

      for (const extractedAsset of extractedData.assets) {
        const existingAsset = existingAssets.find(a => a.symbol === extractedAsset.symbol && a.broker === brokerName.trim());
        const assetPayload = {
          ...extractedAsset,
          broker: brokerName.trim(),
          purchase_price: extractedAsset.purchase_price || extractedAsset.current_price,
        };

        try {
          const today = new Date();
          const priceDetails = await FetchPriceDetails({
            symbol: extractedAsset.symbol,
            date: today.toISOString().slice(0, 10),
            preferOpenAI: true,
          });
          const fetchedCurrent = Number(priceDetails?.current_price);
          if (Number.isFinite(fetchedCurrent)) {
            assetPayload.current_price = fetchedCurrent;
          }
          const fetchedHistorical = Number(priceDetails?.historical_price);
          if (!Number.isFinite(assetPayload.purchase_price) || assetPayload.purchase_price === 0) {
            const fallbackPurchase = Number.isFinite(fetchedHistorical) ? fetchedHistorical : fetchedCurrent;
            if (Number.isFinite(fallbackPurchase)) {
              assetPayload.purchase_price = fallbackPurchase;
            }
          }
        } catch (priceError) {
          console.warn('[CSVPortfolioImport] price lookup failed', priceError);
        }

        if (existingAsset) {
          await Asset.update(existingAsset.id, assetPayload);
          updatedCount++;
        } else {
          await Asset.create(assetPayload);
          createdCount++;
        }
      }

      setProcessingStep('Complete!');
      setResults({ created: createdCount, updated: updatedCount, total: extractedData.assets.length });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isProcessing) {
    return (
      <div className="text-center">
        <Loader2 className="w-8 h-8 mx-auto text-purple-600 animate-spin" />
        <p className="mt-4 text-purple-800 font-medium">{processingStep}</p>
      </div>
    );
  }

  if (results) {
    return (
      <div className="text-center">
        <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
        <h3 className="text-lg font-bold text-purple-900 mt-4">Import Successful!</h3>
        <p className="text-purple-700 mt-2">
          Processed {results.total} assets. <br />
          {results.created} new assets added, and {results.updated} existing assets updated.
        </p>
        <button
          onClick={onSuccess}
          className="mt-6 neomorph rounded-xl px-6 py-3 font-semibold text-purple-800 neomorph-hover transition-all"
        >
          Finish
        </button>
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
      
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-purple-700 block mb-2">Broker Name</label>
          <AutocompleteInput
            value={brokerName}
            onChange={handleBrokerChange}
            suggestions={uniqueBrokers}
            placeholder="e.g., Robinhood"
            className="w-full neomorph-inset rounded-xl px-4 py-3 text-purple-900 bg-transparent"
            required
            name="brokerName"
          />
        </div>

        <div 
          onDragEnter={handleDrag} 
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragActive ? 'border-purple-600 bg-purple-100' : 'border-purple-300'}`}
        >
          <input 
            type="file" 
            id="csv-upload" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
            onChange={handleFileInput}
            accept=".csv"
          />
          <label htmlFor="csv-upload" className="cursor-pointer">
            <Upload className="w-8 h-8 mx-auto text-purple-500 mb-3" />
            <p className="font-semibold text-purple-700">
              {file ? file.name : 'Click to upload or drag & drop'}
            </p>
            <p className="text-xs text-purple-600">CSV file format</p>
          </label>
        </div>
      </div>

      <div className="neomorph-inset rounded-xl p-4">
        <h4 className="font-semibold text-purple-800 mb-2 flex items-center"><File className="w-4 h-4 mr-2"/>CSV Format Tips</h4>
        <ul className="list-disc list-inside space-y-1 text-sm text-purple-700">
          <li>Ensure clear headers like: Symbol, Quantity, Price.</li>
          <li>AI will attempt to map columns automatically.</li>
        </ul>
      </div>

      <button
        onClick={handleProcessFile}
        disabled={!file || !brokerName}
        className="w-full neomorph rounded-xl px-6 py-3 font-semibold text-purple-800 neomorph-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Process CSV
      </button>
    </div>
  );
}

