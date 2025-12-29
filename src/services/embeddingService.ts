import OpenAI from "openai";
import prisma from "../config/prisma";
import { Pinecone } from '@pinecone-database/pinecone';

export class EmbeddingService {
    private openai: OpenAI;
    private pinecone: Pinecone;
    private index: any;

    constructor() {
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });

        this.pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!,
        });
        this.index = this.pinecone.index(process.env.PINECONE_INDEX_NAME!);
    }

    /**
     * Splits text into chunks with overlap for better context
     */
    private chunkText(text: string, chunkSize: number = 1000, overlap: number = 200): string[] {
        const chunks: string[] = [];
        if (!text) return chunks;

        let start = 0;
        while (start < text.length) {
            let end = start + chunkSize;
            chunks.push(text.substring(start, end));
            if (end >= text.length) break;
            start = end - overlap;
        }

        return chunks;
    }

    /**
     * Generates embeddings for a single piece of text using OpenAI
     */
    public async generateEmbedding(text: string): Promise<number[]> {
        try {
            console.log("Generating embedding using OpenAI (text-embedding-3-small)...");
            const response = await this.openai.embeddings.create({
                model: "text-embedding-3-small",
                input: text,
            });

            const embedding = response.data[0]?.embedding;
            if (!embedding) {
                throw new Error("Empty response from OpenAI embeddings");
            }

            return embedding;
        } catch (error: any) {
            console.error("OpenAI Embedding Error:", error?.message || error);
            throw new Error("Failed to generate OpenAI embedding");
        }
    }

    /**
     * Processes a file by chunking and saving embeddings to Pinecone
     */
    public async processFile(fileId: number, text: string): Promise<void> {
        const startTime = Date.now();
        try {
            await (prisma as any).file.update({
                where: { id: fileId },
                data: { vectorStatus: "PROCESSING" }
            });

            const chunks = this.chunkText(text);
            if (chunks.length === 0) {
                throw new Error("No text chunks generated from file");
            }

            console.log(`[Perf] Step 1: File ${fileId} chunked into ${chunks.length} chunks. Time: ${Date.now() - startTime}ms`);

            // 1. Generate embeddings using OpenAI
            const embeddingStart = Date.now();
            console.log(`[Perf] Step 2: Requesting batch embeddings from OpenAI (text-embedding-3-small) for ${chunks.length} chunks...`);

            const response = await this.openai.embeddings.create({
                model: "text-embedding-3-small",
                input: chunks,
            });

            console.log(`[Perf] Step 2: OpenAI embeddings finished. Time: ${Date.now() - embeddingStart}ms`);

            // 2. Prepare vectors for Pinecone
            const vectors = response.data.map((item: any, index: number) => ({
                id: `file-${fileId}-chunk-${index}`,
                values: item.embedding,
                metadata: {
                    text: chunks[index],
                    fileId: fileId,
                    chunkIndex: index
                }
            }));

            // 3. Upsert to Pinecone in one batch
            const pineconeStart = Date.now();
            console.log(`[Perf] Step 3: Upserting ${vectors.length} vectors to Pinecone...`);
            const namespace = this.index.namespace(`file-${fileId}`);
            await namespace.upsert(vectors);
            console.log(`[Perf] Step 3: Pinecone Upsert finished. Time: ${Date.now() - pineconeStart}ms`);

            await (prisma as any).file.update({
                where: { id: fileId },
                data: { vectorStatus: "COMPLETED" }
            });

            console.log(`✅ [Perf] File ${fileId} TOTAL vectorization time: ${Date.now() - startTime}ms`);
        } catch (err) {
            console.error(`❌ [Perf] Vectorization error for file ${fileId} after ${Date.now() - startTime}ms:`, err);
            await (prisma as any).file.update({
                where: { id: fileId },
                data: { vectorStatus: "FAILED" }
            }).catch(() => { });
        }
    }

    /**
     * Searches Pinecone for the most relevant chunks
     */
    public async search(fileId: number, queryEmbedding: number[], topK: number = 5): Promise<string[]> {
        try {
            const namespace = this.index.namespace(`file-${fileId}`);
            const queryResponse = await namespace.query({
                vector: queryEmbedding,
                topK: topK,
                includeMetadata: true,
            });

            return queryResponse.matches
                .map((match: any) => match.metadata?.text)
                .filter((text: string | undefined) => !!text) as string[];
        } catch (err) {
            console.error(`Pinecone search error for file ${fileId}:`, err);
            return [];
        }
    }

    /**
     * Legacy similarity helper (Not used with Pinecone)
     */
    public calculateSimilarity(v1: number[], v2: number[]): number {
        return 0; // Pinecone handles this now
    }
}
