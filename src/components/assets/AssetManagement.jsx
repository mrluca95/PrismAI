import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Asset } from '@/entities/Asset';
import AssetEditForm from './AssetEditForm';
import SwipeableAssetItem from './SwipeableAssetItem';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AssetManagement({ assets, onAssetsChange }) {
  const [editingAsset, setEditingAsset] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(null);

  const handleEdit = (asset) => {
    setEditingAsset(asset);
    setShowEditDialog(true);
  };

  const handleDelete = async (assetId) => {
    if (!confirm('Are you sure you want to delete this asset? This action cannot be undone.')) {
      return;
    }
    
    setIsDeleting(assetId);
    try {
      await Asset.delete(assetId);
      onAssetsChange(); // Refresh the assets list
    } catch (error) {
      console.error('Failed to delete asset:', error);
      alert('Failed to delete asset. Please try again.');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleEditSuccess = () => {
    setShowEditDialog(false);
    setEditingAsset(null);
    onAssetsChange(); // Refresh the assets list
  };

  if (assets.length === 0) {
    return (
      <div className="neomorph rounded-2xl p-8 text-center">
        <Plus className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 mb-2">No assets in your portfolio</p>
        <p className="text-sm text-gray-500">Add assets by creating transactions or importing from CSV</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Manage Assets</h2>
        <p className="text-sm text-gray-600">{assets.length} assets</p>
      </div>

      {/* Swipe hint */}
      <div className="neomorph-inset rounded-xl p-3 text-center">
        <p className="text-xs text-gray-600">
          Tip: Swipe right to edit, swipe left to delete assets
        </p>
      </div>
      
      <div className="space-y-3">
        {assets.map((asset) => (
          <SwipeableAssetItem
            key={asset.id}
            asset={asset}
            onEdit={handleEdit}
            onDelete={handleDelete}
            isDeleting={isDeleting === asset.id}
          />
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-purple-100 border-none neomorph p-0 rounded-2xl max-w-md" style={{ backgroundColor: '#f3f0ff' }}>
          <DialogHeader className="p-6 pb-0">
            <DialogTitle className="text-xl font-bold text-purple-900">
              Edit {editingAsset?.symbol}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6">
            <AssetEditForm
              asset={editingAsset}
              onSuccess={handleEditSuccess}
              onCancel={() => setShowEditDialog(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
