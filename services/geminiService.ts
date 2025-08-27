/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

const handleImageEditApiResponse = (
    response: GenerateContentResponse,
    context: string
): string => {
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `Image generation for ${context} stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `The AI model did not return an image for the ${context}. ` + 
        (textFeedback ? `Feedback: "${textFeedback}"` : 'No additional feedback was provided.');
    console.error(errorMessage, { response });
    throw new Error(errorMessage);
};

export const generateTattooDesign = async (prompt: string, stylePrompt?: string): Promise<string[]> => {
    const fullPrompt = `
      Generate a high-quality, professional tattoo design based on the following concept: "${prompt}".

      **Style Guidance:**
      - The output must be a clean piece of artwork, suitable for a tattoo flash sheet.
      - Render the design primarily in black ink on a solid, pure white background (#FFFFFF).
      - Emphasize clear, sharp linework and well-defined shapes. Avoid overly sketchy or blurry styles.
      - ${stylePrompt ? `Incorporate the following artistic style: "${stylePrompt}".` : 'Use a versatile, modern illustration style.'}

      **Negative Constraints (What to AVOID):**
      - Do NOT show the tattoo on any skin or body part.
      - Do NOT include any background elements, textures, or colors. The background must be pure white.
      - Do NOT depict hands, tattoo machines, or any other real-world objects. The image should only contain the artwork itself.
      - Do NOT generate a photograph of an existing tattoo. This is a design concept.

      The final image should be centered and ready for an artist to use as a stencil.
    `;
    console.log(`Generating tattoo designs with prompt: "${fullPrompt}"`);
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: fullPrompt,
            config: {
                numberOfImages: 4,
                outputMimeType: 'image/png',
                aspectRatio: '1:1',
            },
        });
        
        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error('The AI did not return any images.');
        }

        return response.generatedImages.map(img => {
            const base64ImageBytes: string = img.image.imageBytes;
            const mimeType = img.image.mimeType;
            return `data:${mimeType};base64,${base64ImageBytes}`;
        });

    } catch (error) {
        console.error('Error generating tattoo designs:', error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate tattoo designs. ${error.message}`);
        }
        throw new Error('An unknown error occurred while generating tattoo designs.');
    }
};

export const searchReferenceImages = async (prompt: string): Promise<string[]> => {
    console.log(`Searching for reference images: "${prompt}"`);
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: `High-quality, artistic reference image for inspiration: ${prompt}.`,
            config: {
                numberOfImages: 4,
                outputMimeType: 'image/jpeg', // JPEG is fine for references
                aspectRatio: '1:1',
            },
        });

        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error('The AI did not return any reference images.');
        }

        return response.generatedImages.map(img => `data:${img.image.mimeType};base64,${img.image.imageBytes}`);
    } catch (error) {
        console.error('Error searching for reference images:', error);
        throw new Error(`Failed to find reference images. ${error instanceof Error ? error.message : ''}`);
    }
};

export const describeImageStyle = async (image: File): Promise<string> => {
    console.log('Describing image style...');
    const imagePart = await fileToPart(image);

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                imagePart,
                { text: 'You are an art critic. Concisely describe the artistic style of this image in a way that can be used as a prompt for another AI image generator. Focus on style, mood, and technique (e.g., "fine-line illustration", "bold traditional with heavy blacks", "ethereal watercolor style with soft gradients"). Do not describe the subject matter. Give me only the style description.' },
            ],
        },
    });

    return response.text.trim();
};

export const blendVirtualTattoo = async (composedImage: File): Promise<string> => {
    console.log(`Blending virtual tattoo...`);
    const composedImagePart = await fileToPart(composedImage);

    const prompt = `
        **Persona:** You are an expert digital artist specializing in photorealistic virtual tattoo application.

        **Task:** The user has already placed a tattoo design onto their photo. Your task is to seamlessly and realistically blend the tattoo layer with the user's skin in the underlying photo layer.

        **Technical Instructions:**
        1.  **Contour Mapping:** The tattoo must wrap perfectly around the natural curves and contours of the body it has been placed on. It should not look flat or like a sticker.
        2.  **Lighting and Shadow:** Precisely match the lighting of the tattoo to the ambient lighting in the user's photo. Accurately replicate existing shadows and highlights on the skin over the tattoo.
        3.  **Skin Texture Blending:** Integrate the tattoo with the underlying skin texture. The skin's pores and fine lines should be subtly visible through the ink. Apply a slight translucency to the ink to mimic it being under the top layer of skin.
        4.  **Color Integrity:** Maintain the original colors and details of the tattoo design, only adjusting them for lighting and blending.
        
        **Constraints:**
        - Do not modify any part of the user's photo except for blending the tattoo.
        - Do not change the position, size, or rotation of the tattoo.
        - Do not add any text, watermarks, or other artifacts.
        - The final output must be ONLY the edited photograph.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                composedImagePart,
                { text: prompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });

    return handleImageEditApiResponse(response, 'virtual tattoo blending');
};

export const generateTattooStencil = async (image: File): Promise<string> => {
    console.log(`Generating tattoo stencil...`);
    const imagePart = await fileToPart(image);

    const fullPrompt = `
        You are a professional tattoo artist's assistant. Your task is to convert the provided full-color tattoo design into a clean, precise black-and-white stencil or outline.

        **Instructions:**
        1.  **Extract Linework:** Trace all the essential lines of the design. The output should be only the linework.
        2.  **Remove Shading & Color:** Eliminate all color, shading, gradients, and textures.
        3.  **Output Style:** The result must be sharp, high-contrast black lines on a solid, pure white background.
        4.  **Preserve Detail:** Maintain the integrity and all important details of the original design.
        
        The final output must be ONLY the generated stencil image, suitable for a tattoo artist to use for transfer. Do not add any other elements.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: {
            parts: [
                imagePart,
                { text: fullPrompt },
            ],
        },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    
    return handleImageEditApiResponse(response, 'tattoo stencil generation');
};


export interface Artist {
    name: string;
    description: string;
    address: string;
    website?: string;
    specialties?: string[];
    availability?: string;
    portfolioUrl?: string;
    portfolio?: string[];
    latitude?: number;
    longitude?: number;
    styleMatch?: boolean;
}

export interface GroundingSource {
    uri: string;
    title: string;
}

export interface ArtistSearchResult {
    artists: Artist[];
    sources: GroundingSource[];
}

export const findArtists = async (location: string, image?: File | null): Promise<ArtistSearchResult> => {
    console.log(`Finding artists near: "${location}"`, image ? "with image style reference." : "");
    const textPrompt = `
        You are an expert data extractor. Your task is to find tattoo artists and studios in "${location}" and return the data in a specific JSON format.
        ${image ? "An image has been provided as a style reference. Analyze its artistic style (e.g., photorealism, geometric, watercolor, traditional, fine-line). You MUST analyze the portfolios of the artists you find and set 'styleMatch' to true for artists whose work is a strong match for the provided style." : ""}

        For each artist or studio found, you MUST provide the following information in a JSON object. Adhere strictly to the keys and data types.

        - name: (string) The studio or artist's full name.
        - description: (string) A concise one-sentence description of their work or specialty.
        - address: (string) The complete physical address.
        - latitude: (number) The geographic latitude of the address. This is required.
        - longitude: (number) The geographic longitude of the address. This is required.
        - website: (string | null) The main website URL.
        - specialties: (string[]) An array of strings listing their specific tattoo styles (e.g., ["Realism", "Fine-line", "Japanese Traditional"]). If not explicitly stated, infer styles from the description.
        - availability: (string | null) A short status like "Accepting new clients", "Books opening soon", or "Books currently closed".
        - portfolioUrl: (string | null) A direct link to their primary portfolio (e.g., Instagram, official gallery).
        - portfolio: (string[]) An array of 3-5 direct URLs to images of their past work. These must be direct image links (ending in .jpg, .png, etc.), not links to pages.
        - styleMatch: (boolean) ${image ? "Set to true if their portfolio style matches the provided image's style, otherwise false." : "Set to false."}

        **CRITICAL INSTRUCTIONS:**
        - Your entire response MUST be a single, valid JSON array of these objects.
        - Do NOT include any text, markdown formatting (like \`\`\`json), or explanations before or after the JSON array.
        - If a piece of information cannot be found, use \`null\` for string fields and an empty array \`[]\` for array fields.
        - Latitude and Longitude are mandatory. You must find the coordinates for the given address.
    `;
    
    const parts: any[] = [];
    if (image) {
        const imagePart = await fileToPart(image);
        parts.push(imagePart);
    }
    parts.push({ text: textPrompt });

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts: parts },
            config: {
                tools: [{googleSearch: {}}],
            },
        });

        const text = response.text.trim();
        let artists: Artist[] = [];

        try {
            const jsonString = text.replace(/^```json|```$/g, '').trim();
            artists = JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse JSON from model response:", e, "Raw response:", text);
            throw new Error("The AI returned a response that could not be understood. Please try a different search.");
        }

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
        const sources: GroundingSource[] = groundingChunks
            .map((chunk: any) => chunk.web)
            .filter((web: any) => web?.uri && web?.title)
            .reduce((acc: GroundingSource[], current: any) => { // Remove duplicates
                if (!acc.find(item => item.uri === current.uri)) {
                    acc.push(current);
                }
                return acc;
            }, []);

        return { artists, sources };

    } catch (error) {
        console.error('Error finding artists:', error);
        throw new Error(`Failed to find artists. ${error instanceof Error ? error.message : ''}`);
    }
};

export const generateArtistResponse = async (
    conversationHistory: { sender: string; text: string }[], 
    artist: Artist, 
    userMessage: string,
    model: string
): Promise<string> => {
    console.log(`Generating artist response using ${model}...`);

    const history = conversationHistory.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
    }));
    
    // Remove last message from history, as it's the current user message
    history.pop(); 

    const systemInstruction = `
        You are roleplaying as ${artist.name}, a professional tattoo artist.
        Your persona: You are helpful, professional, and passionate about your craft.
        Your specialties are: ${artist.specialties?.join(', ') || 'various styles'}.
        Your availability is: ${artist.availability || 'not specified'}.
        
        Instructions:
        - Respond to the user's message in a conversational and helpful way, staying in character as the artist.
        - Keep your responses concise and to the point.
        - You can discuss tattoo ideas, placement, pricing concepts (give estimates, not firm quotes), and scheduling.
        - Do not break character. Do not mention that you are an AI.
    `;

    try {
        const chat = ai.chats.create({ model, config: { systemInstruction } });
        const response = await chat.sendMessage({ message: userMessage });
        return response.text.trim();
    } catch (error) {
        console.error('Error generating artist response:', error);
        throw new Error('Failed to get a response from the artist AI.');
    }
};