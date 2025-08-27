/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { TattooMachineIcon, GalleryIcon } from './icons';

interface HeaderProps {
    onReset: () => void;
    onShowGallery: () => void;
    galleryItemCount: number;
}

const Header: React.FC<HeaderProps> = ({ onReset, onShowGallery, galleryItemCount }) => {
  return (
    <header className="w-full py-4 px-8 border-b border-amber-500/10 bg-black/30 backdrop-blur-sm sticky top-0 z-40">
      <div className="flex items-center justify-between">
          <div 
            className="flex items-center justify-center gap-3 cursor-pointer"
            onClick={onReset}
            title="Start New Design"
          >
              <TattooMachineIcon className="w-8 h-8 text-amber-400" />
              <h1 
                className="text-3xl font-bold tracking-wider text-gray-100" 
                style={{ fontFamily: "'Cinzel', serif" }}
              >
                InkGenius
              </h1>
          </div>
          
          <button
            onClick={onShowGallery}
            className="relative bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold py-2 px-5 rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <GalleryIcon className="w-5 h-5" />
            My Gallery
            {galleryItemCount > 0 && (
                <span className="absolute -top-2 -right-2 w-6 h-6 bg-amber-500 text-gray-900 text-xs font-bold rounded-full flex items-center justify-center border-2 border-gray-900">
                    {galleryItemCount}
                </span>
            )}
          </button>
      </div>
    </header>
  );
};

export default Header;
