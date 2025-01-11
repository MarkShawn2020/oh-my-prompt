/**
 * Types for prompt management
 */

export type PromptType = 'global' | 'project';

export interface PromptMeta {
    type: PromptType;
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    date: string;
    license: string;
}

export interface Prompt {
    meta: PromptMeta;
    content: string;
}
