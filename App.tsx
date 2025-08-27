/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Stage, Layer, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import { blendVirtualTattoo, findArtists, Artist, searchReferenceImages, describeImageStyle, generateArtistResponse, generateTattooStencil, generateTattooDesign, GroundingSource, ArtistSearchResult } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import StartScreen from './components/StartScreen';
import { TattooMachineIcon, ImageIcon, UploadIcon, FilterIcon, SearchIcon, ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, SaveIcon, TrashIcon, GalleryIcon, XCircleIcon, XIcon, PaletteIcon, ArtPlaceholderIcon, SendIcon, FileTextIcon, MapPinIcon, MoveIcon, SparklesIcon } from './components/icons';

// Fix for default Leaflet icon not showing up
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type AppStep = 'START' | 'DESIGN' | 'TRY_ON' | 'DONE' | 'FIND_ARTIST' | 'GALLERY';

interface Message {
  sender: 'user' | 'artist';
  text: string;
  timestamp: string;
}

interface Project {
  id: string;
  designImage: string;
  stencilImage?: string | null;
  artist: Artist;
  savedAt: string;
  conversation: Message[];
  contract: {
    status: 'Pending' | 'Approved' | 'In Progress' | 'Completed';
    price: string;
    appointmentDate: string;
  };
}

// Sub-Components
const BackgroundImage = ({ imageUrl, width, height }) => {
    const [img] = useImage(imageUrl, 'anonymous');
    return <KonvaImage image={img} width={width} height={height} />;
};

const TattooImage = ({ image, isSelected, onSelect, onDeselect }) => {
    const [img] = useImage(image, 'anonymous');
    const transformerRef = useRef(null);
    const imageRef = useRef(null);

    useEffect(() => {
        if (isSelected && transformerRef.current && imageRef.current) {
            (transformerRef.current as any).nodes([imageRef.current]);
            (transformerRef.current as any).getLayer().batchDraw();
        }
    }, [isSelected]);
    
    const handleSelect = () => {
        if (typeof onSelect === 'function') {
            onSelect();
        }
    };

    return (
        <>
            <KonvaImage
                image={img}
                ref={imageRef}
                onClick={handleSelect}
                onTap={handleSelect}
                draggable
                onDragEnd={(e) => {
                    // handle drag end if needed
                }}
                onTransformEnd={(e) => {
                    const node = imageRef.current;
                    if (node) {
                        const scaleX = (node as any).scaleX();
                        const scaleY = (node as any).scaleY();
                        (node as any).scaleX(scaleX);
                        (node as any).scaleY(scaleY);
                    }
                }}
            />
            {isSelected && (
                <Transformer
                    ref={transformerRef}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 5 || newBox.height < 5) {
                            return oldBox;
                        }
                        return newBox;
                    }}
                />
            )}
        </>
    );
};

const ArtistCard: React.FC<{
  artist: Artist;
  onContact: (artist: Artist) => void;
  onSelect: () => void;
  isSelected: boolean;
}> = ({ artist, onContact, onSelect, isSelected }) => {
  const handleCardClick = (e: React.MouseEvent) => {
    if (e.target instanceof HTMLAnchorElement || e.target instanceof HTMLButtonElement || (e.target as HTMLElement).closest('button')) {
        return;
    }
    onSelect();
  };
  
  const availabilityStatus = artist.availability?.toLowerCase() || '';
  const isAccepting = availabilityStatus.includes('accepting');

  return (
    <div 
      className={`bg-gray-900/50 border rounded-xl flex flex-col transition-all duration-300 overflow-hidden cursor-pointer ${isSelected ? 'border-amber-500 shadow-lg shadow-amber-500/10' : 'border-amber-500/10 hover:border-amber-500/30'}`}
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ')) handleCardClick(e as any); }}
      aria-pressed={isSelected}
    >
      <div className="relative w-full aspect-[16/9] bg-black/20">
        {artist.portfolio && artist.portfolio.length > 0 ? (
          <img src={artist.portfolio[0]} alt={`${artist.name}'s work`} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <ArtPlaceholderIcon className="w-16 h-16"/>
          </div>
        )}
         {artist.styleMatch && (
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-gradient-to-br from-purple-600 to-blue-500 text-white text-xs font-bold px-2.5 py-1 rounded-full border-2 border-white/20 shadow-lg">
                <SparklesIcon className="w-4 h-4"/>
                Style Match
            </div>
        )}
        {artist.availability && (
            <div className={`absolute top-2 right-2 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm text-xs font-semibold px-2.5 py-1 rounded-full border border-white/10 ${isAccepting ? 'text-green-300' : 'text-yellow-300'}`}>
                <span className={`w-2 h-2 rounded-full ${isAccepting ? 'bg-green-400' : 'bg-yellow-400'}`}></span>
                {artist.availability}
            </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-grow">
          <h3 className="text-xl font-bold text-amber-400">{artist.name}</h3>
          {artist.description && <p className="text-gray-300 mt-1 text-sm flex-grow">{artist.description}</p>}
          
          {artist.specialties && artist.specialties.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
                {artist.specialties.map(spec => (
                    <span key={spec} className="bg-amber-500/10 text-amber-300 text-xs font-semibold px-2.5 py-1 rounded-full">{spec}</span>
                ))}
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-amber-500/10 flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => onContact(artist)}
                className="w-full sm:w-auto flex-1 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 px-5 rounded-lg transition-colors text-sm"
              >
                Contact Artist
              </button>
              {artist.portfolioUrl && (
                <a
                  href={artist.portfolioUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto flex-1 inline-flex items-center justify-center gap-2 bg-black/20 hover:bg-black/40 text-amber-300 font-bold py-3 px-5 rounded-lg transition-colors text-sm"
                >
                  Full Portfolio <ExternalLinkIcon className="w-4 h-4" />
                </a>
              )}
          </div>
      </div>
    </div>
  );
};

const MapUpdater: React.FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 12);
    }
  }, [center, map]);
  return null;
};

// Main App Component
const App: React.FC = () => {
    // State
    const [appStep, setAppStep] = useState<AppStep>('START');
    const [prompt, setPrompt] = useState<string>('');
    const [generatedTattoos, setGeneratedTattoos] = useState<string[]>([]);
    const [selectedTattoo, setSelectedTattoo] = useState<string | null>(null);
    const [tryOnImage, setTryOnImage] = useState<string | null>(null);
    const [finalImage, setFinalImage] = useState<string | null>(null);
    const [artists, setArtists] = useState<Artist[]>([]);
    const [artistSearchSources, setArtistSearchSources] = useState<GroundingSource[]>([]);
    const [artistSpecialtyFilter, setArtistSpecialtyFilter] = useState<string[]>([]);
    const [artistAvailabilityFilter, setArtistAvailabilityFilter] = useState<string>('all');
    const [artistSort, setArtistSort] = useState<string>('default');
    const [allSpecialties, setAllSpecialties] = useState<string[]>([]);
    const [bookingArtist, setBookingArtist] = useState<Artist | null>(null);
    const [projects, setProjects] = useState<Project[]>([]);
    const [viewingProject, setViewingProject] = useState<Project | null>(null);
    const [referenceSearchQuery, setReferenceSearchQuery] = useState<string>('');
    const [referenceImages, setReferenceImages] = useState<string[]>([]);
    const [selectedReferenceImage, setSelectedReferenceImage] = useState<string | null>(null);
    const [styleDescription, setStyleDescription] = useState<string>('');
    const [locationSearch, setLocationSearch] = useState<string>('New York City');
    const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
    const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
    const [searchedForArtists, setSearchedForArtists] = useState(false);
    
    const stageRef = useRef<any>(null);
    const [selectedKonvaImageId, setSelectedKonvaImageId] = useState<string | null>('tattoo-image');

    // Mutations
    const generateTattooMutation = useMutation({ mutationFn: (vars: {prompt: string, stylePrompt?: string}) => generateTattooDesign(vars.prompt, vars.stylePrompt), onSuccess: (data) => setGeneratedTattoos(data) });
    const blendTattooMutation = useMutation({ mutationFn: (image: File) => blendVirtualTattoo(image), onSuccess: (data) => { setFinalImage(data); setAppStep('DONE'); }});
    const findArtistsMutation = useMutation({ mutationFn: (vars: { location: string, image?: File | null }) => findArtists(vars.location, vars.image), onSuccess: (data: ArtistSearchResult) => {
      setArtists(data.artists); 
      setArtistSearchSources(data.sources);
      const uniqueSpecialties = [...new Set(data.artists.flatMap(a => a.specialties || []))];
      setAllSpecialties(uniqueSpecialties);
      if (data.artists.length > 0 && data.artists[0].latitude && data.artists[0].longitude) {
        setMapCenter([data.artists[0].latitude, data.artists[0].longitude]);
      } else {
        setMapCenter(null);
      }
      setSearchedForArtists(true);
    }});
    const searchReferenceMutation = useMutation({ mutationFn: searchReferenceImages, onSuccess: (data) => setReferenceImages(data) });
    const describeStyleMutation = useMutation({ mutationFn: describeImageStyle, onSuccess: (data) => setStyleDescription(data) });
    const generateStencilMutation = useMutation({ mutationFn: (imageFile: File) => generateTattooStencil(imageFile), onSuccess: (data) => {
        if (viewingProject) {
            updateProject(viewingProject.id, { stencilImage: data });
        }
    }});
    const artistResponseMutation = useMutation({ mutationFn: (vars: { history: Message[], artist: Artist, message: string, model: string }) => generateArtistResponse(vars.history, vars.artist, vars.message, vars.model), 
    onSuccess: (data, vars) => {
        if (viewingProject) {
            const newArtistMessage: Message = { sender: 'artist', text: data, timestamp: new Date().toISOString() };
            const newConversation = [...viewingProject.conversation, newArtistMessage];
            updateProject(viewingProject.id, { conversation: newConversation });
        }
    }});

    // Local Storage for Projects
    useEffect(() => {
        try {
            const savedProjects = localStorage.getItem('inkgenius_projects');
            if (savedProjects) {
                setProjects(JSON.parse(savedProjects));
            }
        } catch (error) {
            console.error("Failed to load projects from localStorage", error);
        }
    }, []);

    const updateProject = (projectId: string, updates: Partial<Project>) => {
        const updatedProjects = projects.map(p => p.id === projectId ? { ...p, ...updates } : p);
        setProjects(updatedProjects);
        setViewingProject(prev => prev ? { ...prev, ...updates } : null);
        try {
            localStorage.setItem('inkgenius_projects', JSON.stringify(updatedProjects));
        } catch (error) {
            console.error("Failed to save projects to localStorage", error);
        }
    };
    
    // Handlers
    const handleReset = () => {
        setAppStep('START');
        setPrompt('');
        setGeneratedTattoos([]);
        setSelectedTattoo(null);
        setTryOnImage(null);
        setFinalImage(null);
        setArtists([]);
        setSearchedForArtists(false);
    };

    const handleGenerateTattoo = () => {
        if (prompt.trim()) {
            generateTattooMutation.mutate({ prompt, stylePrompt: styleDescription });
        }
    };

    const handleSelectTattoo = (tattoo: string) => {
        setSelectedTattoo(tattoo);
        setAppStep('TRY_ON');
    };
    
    const handleTryOnImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (event) => {
                setTryOnImage(event.target?.result as string);
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };
    
    const handleBlendTattoo = () => {
        if (stageRef.current) {
            const dataURL = (stageRef.current as any).toDataURL({ pixelRatio: 2 });
            const file = dataURLtoFile(dataURL, 'tattoo_try_on.png');
            blendTattooMutation.mutate(file);
        }
    };
    
    const handleFindArtists = (fromStartScreen = false) => {
      let imageFile: File | null = null;
      if (!fromStartScreen && finalImage) {
        imageFile = dataURLtoFile(finalImage, 'final_design.png');
      } else if (!fromStartScreen && selectedTattoo) {
        imageFile = dataURLtoFile(selectedTattoo, 'selected_design.png');
      }
      setSearchedForArtists(false);
      findArtistsMutation.mutate({ location: locationSearch, image: imageFile });
      if (fromStartScreen) {
        setAppStep('FIND_ARTIST');
      }
    };

    const handleSaveProject = (artist: Artist, design: string) => {
        const newProject: Project = {
            id: `proj_${Date.now()}`,
            designImage: design,
            artist: artist,
            savedAt: new Date().toISOString(),
            conversation: [],
            contract: { status: 'Pending', price: '', appointmentDate: '' }
        };
        const updatedProjects = [...projects, newProject];
        setProjects(updatedProjects);
        localStorage.setItem('inkgenius_projects', JSON.stringify(updatedProjects));
    };

    const handleSearchReference = () => {
        if (referenceSearchQuery.trim()) {
            searchReferenceMutation.mutate(referenceSearchQuery);
        }
    };

    const handleSelectReferenceImage = (image: string) => {
        if (selectedReferenceImage === image) {
            setSelectedReferenceImage(null);
            setStyleDescription('');
        } else {
            setSelectedReferenceImage(image);
            const file = dataURLtoFile(image, 'reference.jpg');
            describeStyleMutation.mutate(file);
        }
    };
    
    const filteredArtists = useMemo(() => {
        let sorted = [...artists];
        if(artistSort === 'styleMatch') {
            sorted.sort((a, b) => (b.styleMatch ? 1 : 0) - (a.styleMatch ? 1 : 0));
        }

        return sorted.filter(artist => {
            const specialtyMatch = artistSpecialtyFilter.length === 0 || artist.specialties?.some(s => artistSpecialtyFilter.includes(s));
            const availabilityMatch = artistAvailabilityFilter === 'all' || (artist.availability?.toLowerCase() || '').includes('accepting');
            return specialtyMatch && availabilityMatch;
        });
    }, [artists, artistSpecialtyFilter, artistAvailabilityFilter, artistSort]);

    // Derived State
    const isLoading = generateTattooMutation.isPending || blendTattooMutation.isPending || findArtistsMutation.isPending || searchReferenceMutation.isPending || describeStyleMutation.isPending || generateStencilMutation.isPending || artistResponseMutation.isPending;

    const error = generateTattooMutation.error || blendTattooMutation.error || findArtistsMutation.error || searchReferenceMutation.error || describeStyleMutation.error || generateStencilMutation.error || artistResponseMutation.error;

    return (
        <div className="bg-gray-900 text-gray-100 min-h-screen">
            <Header onReset={handleReset} onShowGallery={() => setAppStep('GALLERY')} galleryItemCount={projects.length} />
            <main className="container mx-auto p-4 sm:p-8">
                {isLoading && (
                    <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-fade-in">
                        <Spinner />
                        <p className="mt-4 text-lg font-semibold text-gray-300">AI is working its magic...</p>
                    </div>
                )}

                {error && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in" onClick={() => { /* Allow closing error? */ }}>
                        <div className="bg-gray-800 border border-red-500/50 p-8 rounded-lg max-w-lg text-center">
                            <XCircleIcon className="w-16 h-16 text-red-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-red-400">An Error Occurred</h2>
                            <p className="text-gray-300 mt-2">{error.message}</p>
                            <button onClick={() => window.location.reload()} className="mt-6 bg-red-500 hover:bg-red-400 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                                Please Try Again
                            </button>
                        </div>
                    </div>
                )}
                
                {appStep === 'START' && <StartScreen onStart={() => setAppStep('DESIGN')} onStartFindArtist={() => { setFinalImage(null); setSelectedTattoo(null); handleFindArtists(true); }}/>}
                
                {appStep === 'DESIGN' && (
                  <div className="animate-fade-in">
                    <h2 className="text-3xl font-bold text-center text-amber-400">1. Describe Your Tattoo</h2>
                    <p className="text-center text-gray-400 mt-2">Enter a prompt and let our AI generate unique designs for you.</p>

                    <div className="max-w-4xl mx-auto mt-8">
                        {/* Style Reference Section */}
                        <div className="bg-black/20 p-6 rounded-xl border border-amber-500/10 mb-6">
                            <h3 className="text-xl font-bold text-gray-200 flex items-center gap-2"><PaletteIcon className="w-6 h-6 text-amber-400"/> Find a Style Reference (Optional)</h3>
                            <p className="text-gray-400 mt-1 mb-4 text-sm">Search for an image to guide the AI's artistic style.</p>
                             <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={referenceSearchQuery}
                                    onChange={(e) => setReferenceSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchReference()}
                                    placeholder="e.g., Japanese traditional art, geometric patterns"
                                    className="flex-grow bg-gray-900/50 border border-amber-500/20 rounded-lg p-3 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                                />
                                <button onClick={handleSearchReference} className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 px-6 rounded-lg transition-colors flex items-center gap-2">
                                    <SearchIcon className="w-5 h-5"/> Search
                                </button>
                            </div>
                            {referenceImages.length > 0 && (
                                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                                    {referenceImages.map((img, index) => (
                                        <div key={index} className="relative group cursor-pointer" onClick={() => handleSelectReferenceImage(img)}>
                                            <img src={img} alt={`Reference ${index + 1}`} className={`w-full h-full object-cover rounded-lg transition-all duration-300 ${selectedReferenceImage === img ? 'ring-4 ring-amber-500' : 'hover:opacity-80'}`} />
                                            {selectedReferenceImage === img && (
                                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                                                    <XCircleIcon className="w-8 h-8 text-white opacity-80 group-hover:opacity-100" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Prompt Section */}
                        <div className="bg-black/20 p-6 rounded-xl border border-amber-500/10">
                            <h3 className="text-xl font-bold text-gray-200 flex items-center gap-2"><TattooMachineIcon className="w-6 h-6 text-amber-400"/> Enter Your Design Prompt</h3>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g., A majestic lion with a crown of thorns, geometric style"
                                rows={4}
                                className="w-full bg-gray-900/50 border border-amber-500/20 rounded-lg p-3 mt-4 focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all"
                            />
                            {styleDescription && <p className="text-sm text-amber-300 mt-2 bg-amber-500/10 p-2 rounded-md">Style identified: {styleDescription}</p>}
                            <button onClick={handleGenerateTattoo} className="mt-4 w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-4 px-6 rounded-lg transition-colors text-lg flex items-center justify-center gap-2">
                                <TattooMachineIcon className="w-6 h-6" /> Generate Designs
                            </button>
                        </div>
                    </div>

                    {generatedTattoos.length > 0 && (
                        <div className="mt-12">
                            <h2 className="text-3xl font-bold text-center text-amber-400">2. Choose Your Favorite</h2>
                            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6">
                                {generatedTattoos.map((tattoo, index) => (
                                    <div key={index} className="bg-gray-800/50 rounded-lg p-4 border border-amber-500/10 hover:border-amber-500/30 transition-all cursor-pointer group" onClick={() => handleSelectTattoo(tattoo)}>
                                        <img src={tattoo} alt={`Generated Tattoo ${index + 1}`} className="w-full rounded-md" />
                                        <button className="mt-4 w-full bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-300 font-bold py-2 px-4 rounded-lg transition-colors">
                                            Select & Try On
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                  </div>
                )}
                
                {appStep === 'TRY_ON' && selectedTattoo && (
                    <div className="animate-fade-in">
                        <h2 className="text-3xl font-bold text-center text-amber-400">3. Virtual Try-On</h2>
                        {!tryOnImage ? (
                            <div className="max-w-xl mx-auto mt-8 text-center bg-black/20 p-8 rounded-xl border border-amber-500/10">
                                <ImageIcon className="w-20 h-20 text-gray-600 mx-auto mb-4"/>
                                <h3 className="text-xl font-bold">Upload a Photo of Yourself</h3>
                                <p className="text-gray-400 mt-2 mb-6">Choose a clear, well-lit photo of the area where you want the tattoo.</p>
                                <label className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 px-6 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-2">
                                    <UploadIcon className="w-6 h-6"/>
                                    Upload Photo
                                    <input type="file" accept="image/*" onChange={handleTryOnImageUpload} className="hidden" />
                                </label>
                            </div>
                        ) : (
                            <div className="mt-8">
                                <div className="max-w-5xl mx-auto flex flex-col items-center gap-4">
                                     <div className="bg-black/30 p-2 rounded-lg border border-amber-500/10 relative">
                                        <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 text-sm rounded-full flex items-center gap-2 z-10">
                                            <MoveIcon className="w-5 h-5"/> Drag, resize, and rotate the tattoo
                                        </div>
                                        <Stage 
                                            width={800} 
                                            height={600} 
                                            ref={stageRef} 
                                            className="rounded-md"
                                            onMouseDown={e => {
                                                const clickedOnEmpty = e.target === e.target.getStage();
                                                if (clickedOnEmpty) {
                                                    setSelectedKonvaImageId(null);
                                                }
                                            }}
                                        >
                                            <Layer>
                                                <BackgroundImage imageUrl={tryOnImage} width={800} height={600} />
                                                <TattooImage 
                                                    image={selectedTattoo}
                                                    isSelected={selectedKonvaImageId === 'tattoo-image'}
                                                    onSelect={() => setSelectedKonvaImageId('tattoo-image')}
                                                    onDeselect={() => setSelectedKonvaImageId(null)}
                                                />
                                            </Layer>
                                        </Stage>
                                    </div>
                                    <button onClick={handleBlendTattoo} className="w-full max-w-xs mt-4 bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-4 px-6 rounded-lg transition-colors text-lg flex items-center justify-center gap-2">
                                        Blend Tattoo
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                {appStep === 'DONE' && finalImage && (
                    <div className="animate-fade-in text-center">
                        <h2 className="text-3xl font-bold text-center text-amber-400">4. Your Finished Design</h2>
                        <div className="mt-8 max-w-2xl mx-auto bg-black/20 p-4 rounded-xl border border-amber-500/10">
                            <img src={finalImage} alt="Final tattoo design" className="w-full rounded-lg" />
                        </div>
                        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                            <button onClick={() => { setAppStep('FIND_ARTIST'); handleFindArtists(); }} className="bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 px-8 rounded-full text-lg">
                                Find an Artist
                            </button>
                             <button onClick={() => handleSaveProject({ name: 'Unassigned' } as Artist, finalImage)} className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold py-3 px-8 rounded-full text-lg inline-flex items-center gap-2">
                                <SaveIcon className="w-5 h-5"/> Save Design
                            </button>
                            <button onClick={handleReset} className="bg-black/20 hover:bg-black/40 text-gray-400 font-bold py-3 px-8 rounded-full text-lg">
                                Start Over
                            </button>
                        </div>
                    </div>
                )}

                {appStep === 'FIND_ARTIST' && (
                  <div className="animate-fade-in">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold text-amber-400">Find Your Perfect Tattoo Artist</h2>
                        <p className="text-gray-400 mt-2 max-w-2xl mx-auto">{finalImage || selectedTattoo ? 'We can use your design to find artists who specialize in this style.' : 'Search for artists by location and specialty.'}</p>
                    </div>

                    <div className="max-w-7xl mx-auto mt-8">
                      <div className="bg-black/20 p-4 rounded-xl border border-amber-500/10 mb-6 flex flex-col md:flex-row items-center gap-4">
                          <div className="flex-grow w-full flex items-center gap-2 bg-gray-900/50 border border-amber-500/20 rounded-lg pr-3">
                            <input
                              type="text"
                              value={locationSearch}
                              onChange={(e) => setLocationSearch(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleFindArtists()}
                              placeholder="Enter a city or address"
                              className="flex-grow bg-transparent p-3 focus:outline-none"
                            />
                            <button onClick={() => handleFindArtists()} className="text-amber-400 hover:text-amber-300">
                                <SearchIcon className="w-5 h-5" />
                            </button>
                          </div>
                          
                          <div className="flex-grow w-full flex items-center gap-2 bg-gray-900/50 border border-amber-500/20 rounded-lg p-3">
                            <FilterIcon className="w-5 h-5 text-gray-500"/>
                            <select onChange={(e) => setArtistSort(e.target.value)} value={artistSort} className="bg-transparent focus:outline-none flex-grow">
                                <option value="default">Sort by Default</option>
                                <option value="styleMatch">Sort by Style Match</option>
                            </select>
                          </div>

                          <div className="flex-grow w-full flex items-center gap-2 bg-gray-900/50 border border-amber-500/20 rounded-lg p-3">
                            <select onChange={(e) => setArtistAvailabilityFilter(e.target.value)} value={artistAvailabilityFilter} className="bg-transparent focus:outline-none flex-grow">
                                <option value="all">All Availabilities</option>
                                <option value="accepting">Accepting New Clients</option>
                            </select>
                          </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 mb-6">
                        <span className="text-sm font-semibold text-gray-400">Filter by Specialty:</span>
                        {allSpecialties.map(spec => (
                          <button
                            key={spec}
                            onClick={() => {
                              setArtistSpecialtyFilter(prev =>
                                prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
                              );
                            }}
                            className={`px-3 py-1 text-sm rounded-full transition-colors ${artistSpecialtyFilter.includes(spec) ? 'bg-amber-500 text-gray-900 font-bold' : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'}`}
                          >
                            {spec}
                          </button>
                        ))}
                      </div>

                       <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                           <div className="h-[600px] lg:h-auto rounded-xl overflow-hidden border border-amber-500/10">
                               <MapContainer center={mapCenter || [40.7128, -74.0060]} zoom={12} scrollWheelZoom={true} className="h-full w-full bg-gray-800">
                                   <TileLayer
                                       attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                       url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                   />
                                   <MapUpdater center={mapCenter} />
                                   {filteredArtists.map((artist, idx) => artist.latitude && artist.longitude && (
                                       <Marker 
                                            key={`${artist.name}-${idx}`} 
                                            position={[artist.latitude, artist.longitude]}
                                            eventHandlers={{
                                                click: () => {
                                                    document.getElementById(`artist-card-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                    setSelectedArtistId(`${artist.name}-${idx}`);
                                                }
                                            }}
                                       >
                                           <Popup>{artist.name}</Popup>
                                       </Marker>
                                   ))}
                               </MapContainer>
                           </div>

                           <div className="max-h-[600px] lg:max-h-[800px] overflow-y-auto pr-2 space-y-6">
                            {findArtistsMutation.isPending ? <Spinner/> : (
                              filteredArtists.length > 0 ? (
                                filteredArtists.map((artist, idx) => (
                                    <div id={`artist-card-${idx}`} key={`${artist.name}-${idx}`}>
                                      <ArtistCard 
                                          artist={artist} 
                                          onContact={setBookingArtist}
                                          onSelect={() => {
                                            if (artist.latitude && artist.longitude) setMapCenter([artist.latitude, artist.longitude]);
                                            setSelectedArtistId(`${artist.name}-${idx}`);
                                          }}
                                          isSelected={selectedArtistId === `${artist.name}-${idx}`}
                                      />
                                    </div>
                                ))
                              ) : (
                                  searchedForArtists && (
                                      <div className="text-center py-16 bg-black/20 rounded-xl">
                                          <XCircleIcon className="w-16 h-16 text-gray-600 mx-auto mb-4"/>
                                          <h3 className="text-xl font-bold text-gray-300">No Artists Found</h3>
                                          <p className="text-gray-500 mt-2">Try adjusting your search location or filters.</p>
                                      </div>
                                  )
                              )
                            )}
                            {artistSearchSources.length > 0 && (
                                <div className="text-xs text-gray-500 mt-4">
                                    <h4 className="font-bold">Sources:</h4>
                                    <ul className="list-disc list-inside">
                                        {artistSearchSources.map(source => (
                                            <li key={source.uri}><a href={source.uri} target="_blank" rel="noopener noreferrer" className="hover:text-amber-400">{source.title}</a></li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                          </div>
                       </div>
                    </div>
                  </div>
                )}
                
                {appStep === 'GALLERY' && (
                    <div className="animate-fade-in">
                        <h2 className="text-3xl font-bold text-amber-400 mb-8">My Gallery</h2>
                        {projects.length === 0 ? (
                            <div className="text-center py-20 bg-black/20 rounded-xl border border-amber-500/10">
                                <GalleryIcon className="w-20 h-20 text-gray-600 mx-auto mb-4"/>
                                <h3 className="text-xl font-bold text-gray-300">Your gallery is empty.</h3>
                                <p className="text-gray-500 mt-2">Saved designs and artist conversations will appear here.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                {projects.map(proj => (
                                    <div key={proj.id} className="bg-gray-800/50 rounded-lg p-4 border border-amber-500/10 hover:border-amber-500/30 transition-all cursor-pointer group" onClick={() => setViewingProject(proj)}>
                                        <img src={proj.designImage} alt="Saved tattoo design" className="w-full rounded-md aspect-square object-cover" />
                                        <div className="mt-3">
                                            <p className="text-lg font-bold text-amber-400 truncate">{proj.artist.name !== 'Unassigned' ? proj.artist.name : 'Saved Design'}</p>
                                            <p className="text-xs text-gray-500">{new Date(proj.savedAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {/* Modals */}
                {bookingArtist && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
                        <div className="bg-gray-900 border border-amber-500/20 p-8 rounded-lg max-w-lg w-full relative">
                            <button onClick={() => setBookingArtist(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                                <XIcon className="w-6 h-6"/>
                            </button>
                            <h2 className="text-2xl font-bold text-amber-400">Contact {bookingArtist.name}</h2>
                            <p className="text-gray-400 mt-2">Your design will be sent along with your message.</p>
                            <div className="mt-6">
                                <img src={finalImage || selectedTattoo} alt="Tattoo design to send" className="w-full max-w-xs mx-auto rounded-lg" />
                                <button onClick={() => { handleSaveProject(bookingArtist, finalImage || selectedTattoo!); setBookingArtist(null); }} className="mt-6 w-full bg-amber-500 hover:bg-amber-400 text-gray-900 font-bold py-3 px-6 rounded-lg transition-colors">
                                    Send Consultation Request
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                
                {viewingProject && (
                    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in">
                        <div className="bg-gray-900 border border-amber-500/20 rounded-lg max-w-4xl w-full h-[90vh] flex flex-col relative">
                            <button onClick={() => setViewingProject(null)} className="absolute top-4 right-4 text-gray-500 hover:text-white z-20">
                                <XIcon className="w-6 h-6"/>
                            </button>
                            <div className="p-6 border-b border-amber-500/10">
                               <h2 className="text-2xl font-bold text-amber-400">Project with {viewingProject.artist.name}</h2>
                            </div>
                            <div className="flex-grow flex overflow-hidden">
                                <div className="w-1/2 p-6 flex flex-col border-r border-amber-500/10">
                                    <div className="flex-shrink-0">
                                      { /* Tabs for Design/Stencil */ }
                                      <img src={viewingProject.designImage} className="w-full rounded-lg"/>
                                      {!viewingProject.stencilImage ? (
                                        <button onClick={() => generateStencilMutation.mutate(dataURLtoFile(viewingProject.designImage, 'design.png'))} className="mt-4 w-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold py-2 rounded-lg">Generate Stencil</button>
                                      ) : (
                                        <img src={viewingProject.stencilImage} className="w-full rounded-lg mt-4 border-2 border-dashed border-amber-500/20 p-2"/>
                                      )}
                                    </div>
                                    <div className="mt-auto pt-6">
                                        <button 
                                            onClick={() => {
                                                if(window.confirm('Are you sure you want to delete this project? This cannot be undone.')) {
                                                    const updatedProjects = projects.filter(p => p.id !== viewingProject.id);
                                                    setProjects(updatedProjects);
                                                    localStorage.setItem('inkgenius_projects', JSON.stringify(updatedProjects));
                                                    setViewingProject(null);
                                                }
                                            }}
                                            className="w-full text-red-400 hover:bg-red-500/10 py-2 rounded-lg flex items-center justify-center gap-2"
                                        >
                                            <TrashIcon className="w-5 h-5"/> Delete Project
                                        </button>
                                    </div>
                                </div>
                                <div className="w-1/2 flex flex-col">
                                    {/* Tabs */}
                                    <div className="p-6 flex-grow flex flex-col bg-black/20">
                                        <h3 className="text-lg font-bold mb-4">Conversation</h3>
                                        <div className="flex-grow bg-gray-900/50 rounded-lg p-4 overflow-y-auto mb-4 space-y-4">
                                            {viewingProject.conversation.map((msg, idx) => (
                                                <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-xl ${msg.sender === 'user' ? 'bg-amber-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                                                        <p>{msg.text}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="text" 
                                                placeholder="Type your message..."
                                                className="flex-grow bg-gray-800 border border-amber-500/20 rounded-lg p-3 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
                                                        const userMessage: Message = { sender: 'user', text: e.currentTarget.value, timestamp: new Date().toISOString() };
                                                        const newConversation = [...viewingProject.conversation, userMessage];
                                                        updateProject(viewingProject.id, { conversation: newConversation });
                                                        artistResponseMutation.mutate({ history: newConversation, artist: viewingProject.artist, message: e.currentTarget.value, model: 'gemini-2.5-flash' });
                                                        e.currentTarget.value = '';
                                                    }
                                                }}
                                            />
                                            <button className="p-3 bg-amber-500 rounded-lg text-gray-900"><SendIcon className="w-6 h-6"/></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </main>
        </div>
    );
};

export default App;