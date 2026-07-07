export interface GenerateFormState {
  prompt: string
  genre: string
  mood: string
  imageFile: File | null
}

export type GenerationStatus = 'idle' | 'generating' | 'done' | 'error'
