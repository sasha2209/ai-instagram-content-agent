import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

export default async function handler(request, response) {
    try {
        const { postId } = request.query; // Get the post ID from the URL
        const render = request.body[0]; // Creatomate sends an array

        if (render.status === 'succeeded') {
            const videoUrl = render.url;

            // Update the post in Supabase with the final URL
            await supabase
                .from('instagram_posts')
                .update({ final_video_url: videoUrl, render_status: 'complete' })
                .eq('id', postId);

            // Send the notification to Discord
            await fetch(process.env.DISCORD_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: `Reel is ready! 🚀\nDownload it here: ${videoUrl}`
                }),
            });
        }
        
        return response.status(200).json({ message: 'Webhook received.' });
    } catch (error) {
        console.error('Webhook Error:', error);
        return response.status(500).json({ error: 'Error processing webhook.' });
    }
}