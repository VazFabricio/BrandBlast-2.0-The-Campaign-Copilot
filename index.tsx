import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Modality } from "@google/genai";

// State interfaces
interface MarketingAngle {
  title: string;
  description: string;
}

interface CampaignAsset {
  title: string;
  image: string;
  text: string | string[]; // Can be a single string or array of headlines
}

const App: React.FC = () => {
    // State for user inputs
    const [productPhoto, setProductPhoto] = useState<string | null>(null);
    const [productName, setProductName] = useState('');
    const [targetAudience, setTargetAudience] = useState('');
    const [desiredVibe, setDesiredVibe] = useState('');

    // State for generated content
    const [marketingAngles, setMarketingAngles] = useState<MarketingAngle[]>([]);
    const [selectedAngle, setSelectedAngle] = useState<MarketingAngle | null>(null);
    const [campaignAssets, setCampaignAssets] = useState<CampaignAsset[]>([]);
    
    // State for Step 4
    const [bannerVariationPrompt, setBannerVariationPrompt] = useState('');
    const [editedBanner, setEditedBanner] = useState<string | null>(null);

    // App state
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [currentStep, setCurrentStep] = useState(1);
    const [error, setError] = useState<string | null>(null);

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    // Step 1 -> 2: Get Marketing Angles
    const getMarketingAngles = async () => {
        if (!productName || !targetAudience || !desiredVibe) return;
        setIsLoading(true);
        setLoadingMessage('Brainstorming strategic angles...');
        setError(null);
        setMarketingAngles([]);
        setSelectedAngle(null);
        setCampaignAssets([]);
        setEditedBanner(null);

        try {
            const prompt = `For a product named "${productName}" targeting "${targetAudience}" with a desired vibe of "${desiredVibe}", suggest 3 distinct marketing campaign angles. For each angle, provide a short, catchy title and a one-sentence description.`;
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: { type: Type.STRING },
                                description: { type: Type.STRING }
                            },
                            required: ["title", "description"]
                        }
                    }
                }
            });

            const angles = JSON.parse(response.text);
            setMarketingAngles(angles);
            setCurrentStep(2);
        } catch (e) {
            setError("Failed to suggest angles. Please try again.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    // Step 2 -> 3: Generate Full Campaign
    const generateCampaignAssets = async () => {
        if (!selectedAngle || !productName || !productPhoto) return;
        setIsLoading(true);
        setLoadingMessage('Generating your full campaign assets...');
        setError(null);
        setCampaignAssets([]);
        setEditedBanner(null);

        try {
            const generateText = async (prompt: string, expectJson: boolean = false) => {
                const config: any = {};
                if (expectJson) {
                    config.responseMimeType = "application/json";
                    config.responseSchema = { type: Type.ARRAY, items: { type: Type.STRING } };
                }
                const result = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt, config });
                return expectJson ? JSON.parse(result.text) : result.text;
            };

            const generateImage = async (prompt: string) => {
                 if (!productPhoto) {
                    throw new Error("Product photo is required for image generation.");
                }

                const productPhotoBase64Data = productPhoto.split(',')[1];
                const productPhotoMimeType = productPhoto.match(/data:(.*);base64,/)?.[1] || 'image/png';
                const objectImagePart = {
                    inlineData: {
                        data: productPhotoBase64Data,
                        mimeType: productPhotoMimeType,
                    },
                };

                const textPart = { text: prompt };

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash-image-preview',
                    contents: { parts: [objectImagePart, textPart] },
                    config: {
                        responseModalities: [Modality.IMAGE, Modality.TEXT],
                    },
                });

                let newImageBase64 = null;
                for (const part of response.candidates[0].content.parts) {
                    if (part.inlineData) {
                        newImageBase64 = part.inlineData.data;
                        break;
                    }
                }

                if (!newImageBase64) {
                    throw new Error(`The model did not return an image for the prompt: "${prompt}"`);
                }

                return `data:image/png;base64,${newImageBase64}`;
            };
            
            const productDescription = `The product is '${productName}'.`;

            // Prompts
            const instagramImagePrompt = `A high-quality, photorealistic lifestyle photo for Instagram. The uploaded product shot is seamlessly integrated into a scene with a '${desiredVibe}' vibe. The scene reflects the marketing angle: '${selectedAngle.title}'. The target audience is ${targetAudience}.`;
            const instagramTextPrompt = `Based on the campaign angle '${selectedAngle.title}', write an engaging Instagram caption for the product ${productName}. Include 3 relevant hashtags and a call-to-action.`;
            
            const facebookImagePrompt = `A photorealistic Facebook ad image. It features the uploaded product in a social scene with people who match the description of '${targetAudience}'. The overall vibe is '${desiredVibe}' and aligns with the marketing angle: '${selectedAngle.title}'.`;
            const facebookTextPrompt = `Write a short, persuasive copy for a Facebook ad for ${productName}. The ad should highlight the benefits based on our campaign angle: '${selectedAngle.title}'. Start with a compelling hook.`;

            const bannerImagePrompt = `A graphic web banner. Isolate the uploaded product on a stylized background that matches a '${desiredVibe}' style. Add the text '${productName}' directly onto the banner in a visually appealing and clear way.`;
            const bannerTextPrompt = `Generate 3 short and punchy headline variations for a web banner about ${productName}, inspired by the angle: '${selectedAngle.title}'.`;

            const [ instagramImage, instagramText, facebookImage, facebookText, bannerImage, bannerText ] = await Promise.all([
                generateImage(instagramImagePrompt),
                generateText(instagramTextPrompt),
                generateImage(facebookImagePrompt),
                generateText(facebookTextPrompt),
                generateImage(bannerImagePrompt),
                generateText(bannerTextPrompt, true)
            ]);

            setCampaignAssets([
                { title: 'Instagram Lifestyle Post', image: instagramImage, text: instagramText },
                { title: 'Facebook Ad (Focus on People)', image: facebookImage, text: facebookText },
                { title: 'Web Banner (Graphic & Direct)', image: bannerImage, text: bannerText }
            ]);

            setCurrentStep(3);

        } catch (e) {
            setError("Failed to generate the campaign. Please try again.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    // Step 4: Generate Banner Variation
    const generateBannerVariation = async () => {
        if (!bannerVariationPrompt) return;

        const originalBanner = campaignAssets.find(a => a.title.includes('Web Banner'));
        if (!originalBanner) {
            setError("Original banner not found. Please generate a campaign first.");
            return;
        }

        if (!productPhoto) {
            setError("Original product photo not found. Please ensure it is still loaded in Step 1.");
            return;
        }

        setIsLoading(true);
        setLoadingMessage('Generating variation...');
        setError(null);
        setEditedBanner(null);

        try {
            // The "object" to edit
            const productPhotoBase64Data = productPhoto.split(',')[1];
            const productPhotoMimeType = productPhoto.match(/data:(.*);base64,/)?.[1] || 'image/png';
            const objectImagePart = {
                 inlineData: {
                    data: productPhotoBase64Data,
                    mimeType: productPhotoMimeType,
                },
            };
            
            // The "environment" to edit within
            const bannerBase64Data = originalBanner.image.split(',')[1];
            const cleanEnvironmentImagePart = {
                inlineData: {
                    data: bannerBase64Data,
                    mimeType: 'image/png',
                },
            };
            
            const textPart = { text: bannerVariationPrompt };

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image-preview',
                contents: { parts: [objectImagePart, cleanEnvironmentImagePart, textPart] },
                config: {
                    responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
            });

            let newImageBase64 = null;
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    newImageBase64 = part.inlineData.data;
                    break;
                }
            }

            if (newImageBase64) {
                setEditedBanner(`data:image/png;base64,${newImageBase64}`);
            } else {
                setError("The model did not return an edited image. Please try a different prompt.");
            }
        } catch (e) {
            setError("Failed to generate banner variation. Please try again.");
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => {
                setProductPhoto(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    const isStep1Complete = !!(productPhoto && productName && targetAudience && desiredVibe);

    return (
        <main className="container">
            <header>
                <h1>BrandBlast 2.0</h1>
                <p>The Campaign Copilot</p>
            </header>

            {error && <div className="error-message">{error}</div>}

            <section className="step" id="step-1" aria-label="Step 1: Product Definition">
                <div className="step-header">
                    <span className="step-number">1</span>
                    <h2>Product Definition</h2>
                </div>
                <div className="form-grid">
                    <div className="form-group file-upload">
                        <label htmlFor="product-photo">Product Photo</label>
                        <div className="file-input-wrapper">
                            <input type="file" id="product-photo" accept="image/*" onChange={handlePhotoChange} />
                            <div className="file-input-preview">
                                {productPhoto ? <img src={productPhoto} alt="Product preview" /> : <span>Click to upload</span>}
                            </div>
                        </div>
                    </div>
                    <div className="form-group">
                        <label htmlFor="product-name">Product Name</label>
                        <input type="text" id="product-name" value={productName} onChange={e => setProductName(e.target.value)} placeholder="Ex: 'HydroFresh Natural Soap'" />
                    </div>
                    <div className="form-group form-group-span-2">
                        <label htmlFor="target-audience">Target Audience</label>
                        <textarea id="target-audience" value={targetAudience} onChange={e => setTargetAudience(e.target.value)} placeholder="Ex: 'Eco-conscious young adults who value organic ingredients...'"></textarea>
                    </div>
                     <div className="form-group form-group-span-2">
                        <label htmlFor="desired-vibe">Desired Vibe / Style</label>
                        <input type="text" id="desired-vibe" value={desiredVibe} onChange={e => setDesiredVibe(e.target.value)} placeholder="Ex: 'Natural, refreshing, organic, minimalist'"/>
                    </div>
                </div>
                <button onClick={getMarketingAngles} disabled={!isStep1Complete || (isLoading && currentStep === 1)}>
                    {isLoading && currentStep === 1 ? <><span className="spinner"></span>{loadingMessage}</> : '1. Suggest Marketing Angles'}
                </button>
            </section>

            {currentStep >= 2 && (
                <section className="step" id="step-2" aria-label="Step 2: Strategic Angle Selection">
                    <div className="step-header">
                        <span className="step-number">2</span>
                        <h2>Strategic Angle Selection</h2>
                    </div>
                    {isLoading && marketingAngles.length === 0 && <div className="loader"><span className="spinner"></span>{loadingMessage}</div>}
                    <div className="angle-cards">
                        {marketingAngles.map((angle, index) => (
                        <div key={index} className={`angle-card ${selectedAngle?.title === angle.title ? 'selected' : ''}`} onClick={() => setSelectedAngle(angle)} tabIndex={0} role="button">
                            <h3>{angle.title}</h3>
                            <p>{angle.description}</p>
                        </div>
                        ))}
                    </div>
                    {marketingAngles.length > 0 && (
                        <button onClick={generateCampaignAssets} disabled={!selectedAngle || (isLoading && currentStep === 2)}>
                            {isLoading && currentStep === 2 ? <><span className="spinner"></span>{loadingMessage}</> : '2. Generate Full Campaign'}
                        </button>
                    )}
                </section>
            )}

            {currentStep === 3 && campaignAssets.length > 0 && (
              <>
                <section className="step" id="step-3" aria-label="Step 3: Campaign Asset Generation">
                    <div className="step-header">
                        <span className="step-number">3</span>
                        <h2>Generated Campaign Assets</h2>
                    </div>
                    <div className="assets-grid">
                        {campaignAssets.map((asset, index) => (
                        <div key={index} className="asset-card">
                            <h3>{asset.title}</h3>
                            <img src={asset.image} alt={asset.title} className="asset-image"/>
                            <div className="asset-text">
                            {Array.isArray(asset.text) ? (
                                <>
                                <h4>Headline Variations:</h4>
                                <ul>
                                    {asset.text.map((line, i) => <li key={i}>{line}</li>)}
                                </ul>
                                </>
                            ) : (
                                <p>{asset.text}</p>
                            )}
                            </div>
                        </div>
                        ))}
                    </div>
                </section>
                <section className="step" id="step-4" aria-label="Step 4: Iteration and A/B Testing">
                     <div className="step-header">
                        <span className="step-number">4</span>
                        <h2>Iteration and A/B Testing</h2>
                    </div>
                     <div className="iteration-container">
                        <div className="iteration-card">
                            <h4>Original Banner</h4>
                            <img src={campaignAssets.find(a => a.title.includes('Web Banner'))!.image} alt="Original Web Banner" />
                        </div>
                        <div className="iteration-controls">
                            <p>Edit the banner with a text command.</p>
                            <textarea 
                                aria-label="Edit with words"
                                placeholder="Ex: 'Change the background to lime green'"
                                value={bannerVariationPrompt}
                                onChange={(e) => setBannerVariationPrompt(e.target.value)}
                            />
                            <button onClick={generateBannerVariation} disabled={!bannerVariationPrompt || isLoading}>
                                {isLoading && currentStep >=3 ? <><span className="spinner"></span>{loadingMessage}</> : 'Generate Variation'}
                            </button>
                        </div>
                         <div className="iteration-card">
                             <h4>Edited Banner</h4>
                             {isLoading && currentStep >= 3 && !editedBanner ? 
                                 <div className="placeholder"><span className="spinner"></span></div> :
                                 editedBanner ? 
                                     <img src={editedBanner} alt="Edited Web Banner" /> : 
                                     <div className="placeholder">Your variation will appear here.</div>
                             }
                         </div>
                    </div>
                </section>
              </>
            )}
        </main>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);