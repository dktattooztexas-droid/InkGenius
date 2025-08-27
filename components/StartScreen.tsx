/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { TattooMachineIcon, ImageIcon, PaletteIcon, MapPinIcon } from './icons';

interface StartScreenProps {
  onStart: () => void;
  onStartFindArtist: () => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart, onStartFindArtist }) => {
  return (
    <div className="w-full max-w-5xl mx-auto text-center p-8">
      <div className="flex flex-col items-center gap-6 animate-fade-in">
        <h1 
            className="text-5xl font-bold tracking-wider text-gray-100 sm:text-6xl md:text-7xl"
            style={{ fontFamily: "'Cinzel', serif" }}
        >
          Design Your Dream Tattoo <span className="text-amber-400">with AI</span>.
        </h1>
        <p className="max-w-3xl text-lg text-gray-400 md:text-xl">
          Generate unique tattoo concepts from your ideas, try them on virtually with your own photos, and connect with artists to bring your vision to life.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button onClick={onStart} className="relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-gray-900 bg-amber-500 rounded-full cursor-pointer group hover:bg-amber-400 transition-colors">
                <TattooMachineIcon className="w-6 h-6 mr-3 transition-transform duration-500 ease-in-out group-hover:rotate-[15deg]" />
                Start Designing
            </button>
            <button onClick={onStartFindArtist} className="relative inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-amber-300 bg-amber-500/10 rounded-full cursor-pointer hover:bg-amber-500/20 transition-colors">
                <MapPinIcon className="w-6 h-6 mr-3" />
                Find an Artist
            </button>
        </div>

        <div className="mt-16 w-full">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-black/20 p-6 rounded-lg border border-amber-500/10 flex flex-col items-center text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-gray-800 rounded-full mb-4">
                       <PaletteIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-100">Describe Your Vision</h3>
                    <p className="mt-2 text-gray-400">Use simple text to describe any tattoo imaginable. From intricate patterns to bold characters, our AI brings your ideas to the canvas.</p>
                </div>
                <div className="bg-black/20 p-6 rounded-lg border border-amber-500/10 flex flex-col items-center text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-gray-800 rounded-full mb-4">
                       <TattooMachineIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-100">Generate AI Designs</h3>
                    <p className="mt-2 text-gray-400">Receive multiple, high-quality tattoo concepts based on your prompt. Choose the one that perfectly captures your style.</p>
                </div>
                <div className="bg-black/20 p-6 rounded-lg border border-amber-500/10 flex flex-col items-center text-center">
                    <div className="flex items-center justify-center w-12 h-12 bg-gray-800 rounded-full mb-4">
                       <ImageIcon className="w-6 h-6 text-amber-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-100">Virtual Try-On</h3>
                    <p className="mt-2 text-gray-400">Upload a photo and see how your chosen design looks on your own skin before making a commitment. It's realistic and instant.</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default StartScreen;
