import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(request, response) {
    try {
        // 1. Check if schedule is full
        const { data: scheduledPosts } = await supabase
            .from('instagram_posts')
            .select('id')
            .eq('status', 'scheduled')
            .gt('scheduled_post_date', new Date().toISOString());

        if (scheduledPosts.length >= 7) {
            return response.status(200).json({ message: 'Schedule is full. No new posts generated.' });
        }

        // 2. Select a book from the queue
        const { data: book } = await supabase
            .from('books_queue')
            .select('*')
            .in('status', ['in_progress', 'pending'])
            .order('created_at', { ascending: true })
            .limit(1)
            .single();

        if (!book) {
             return response.status(200).json({ message: 'No books in queue to process.' });
        }
        
        await supabase.from('books_queue').update({ status: 'in_progress' }).eq('id', book.id);

        // 3. AI Step 1: The Summarizer
        console.log(`Generating summary for "${book.title}"...`);
        const summarizerPrompt = `You are an expert research AI. Generate a comprehensive summary for the book "${book.title}" by ${book.author}. Cover all core principles and actionable advice. The summary must be at least 800 words and rich with detail.`;
        
        const summaryResponse = await groq.chat.completions.create({
            model: "llama3-70b-8192",
            messages: [{ role: "user", content: summarizerPrompt }],
        });
        const bookSummary = summaryResponse.choices[0].message.content;

        // 4. AI Step 2: The Content Creator
        console.log('Generating Instagram posts from summary...');
        const creatorPrompt = `You are an AI social media expert. From the following summary of '${book.title}', generate 3 unique, actionable takeaways. Format your response as a single JSON object with a key "takeaways", which is an array of objects. Each object must have: "headline" (string), "explanation" (string), "actionable_tip" (string), "hashtags" (array of 5 strings), and "image_prompt" (string for an AI image generator). SUMMARY: """${bookSummary}"""`;

        const creatorResponse = await groq.chat.completions.create({
            model: "llama3-8b-8192",
            messages: [{ role: "user", content: creatorPrompt }],
            response_format: { type: "json_object" },
        });

        const { takeaways: newPosts } = JSON.parse(creatorResponse.choices[0].message.content);

        // 5. Save and Schedule Posts
        const postsToInsert = newPosts.map(post => ({ book_id: book.id, ...post }));
        const { data: insertedPosts } = await supabase.from('instagram_posts').insert(postsToInsert).select();
        
        const { data: lastScheduledPost } = await supabase
            .from('instagram_posts')
            .select('scheduled_post_date')
            .not('scheduled_post_date', 'is', null)
            .order('scheduled_post_date', { ascending: false })
            .limit(1)
            .single();
            
        let nextDate = lastScheduledPost ? new Date(lastScheduledPost.scheduled_post_date) : new Date();
        
        for (const post of insertedPosts) {
            nextDate.setDate(nextDate.getDate() + 1);
            await supabase
                .from('instagram_posts')
                .update({ status: 'scheduled', scheduled_post_date: nextDate.toISOString().split('T')[0] })
                .eq('id', post.id);
        }
        
        await supabase.from('books_queue').update({ status: 'completed' }).eq('id', book.id);
        
        return response.status(200).json({ message: `Successfully scheduled ${insertedPosts.length} posts for "${book.title}".` });

    } catch (error) {
        console.error('Error in agent run:', error);
        return response.status(500).json({ error: error.message });
    }
}