import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import { createClient as createPexelsClient } from 'pexels';
import { Client as CreatomateClient } from 'creatomate';

// Initialize all clients
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const pexels = createPexelsClient(process.env.PEXELS_API_KEY);
const creatomate = new CreatomateClient(process.env.CREATOMATE_API_KEY);

export default async function handler(request, response) {
    try {
        // Assume steps to check schedule and select a book are here...
        const { data: book } = await supabase.from('books_queue').select('*').eq('status', 'pending').limit(1).single();
        if (!book) return response.status(200).json({ message: 'No books in queue.' });
        await supabase.from('books_queue').update({ status: 'in_progress' }).eq('id', book.id);

        // AI Step 1 & 2: Summarize and create Reel script
        const summaryResponse = await groq.chat.completions.create({ /* ... summarizer prompt ... */ });
        const bookSummary = summaryResponse.choices[0].message.content;

        const creatorPrompt = `From this summary of '${book.title}', generate a single, engaging Instagram Reel idea. Format it as a single JSON object with keys: "headline" (max 10 words), "tts_script" (a 15-20 second voiceover script), and "video_keyword" (a 1-2 word search term for a stock video). SUMMARY: """${bookSummary}"""`;
        const creatorResponse = await groq.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: creatorPrompt }],
            response_format: { type: "json_object" },
        });
        const postData = JSON.parse(creatorResponse.choices[0].message.content);

        // Save initial data to Supabase
        const { data: [dbPost] } = await supabase.from('instagram_posts').insert([{
            book_id: book.id,
            headline: postData.headline,
            tts_script: postData.tts_script,
            video_keyword: postData.video_keyword,
            render_status: 'rendering'
        }]).select();

        // Fetch video from Pexels
        const videoSearchResult = await pexels.videos.search({ query: postData.video_keyword, orientation: 'portrait', per_page: 1 });
        const videoUrl = videoSearchResult.videos[0]?.video_files.find(f => f.quality === 'hd')?.link;
        if (!videoUrl) throw new Error('No video found.');

        // Send rendering job to Creatomate
        await creatomate.render({
            template_id: process.env.CREATOMATE_TEMPLATE_ID,
            modifications: {
                'stock-video': videoUrl,
                'headline-text': postData.headline,
            },
            // This webhook is called when the video is done
            webhook_url: `${process.env.VERCEL_URL}/api/handle-render-complete?postId=${dbPost.id}`,
        });
        
        return response.status(200).json({ message: `Video rendering job started for post ID ${dbPost.id}.` });

    } catch (error) {
        console.error('Error:', error);
        return response.status(500).json({ error: error.message });
    }
}