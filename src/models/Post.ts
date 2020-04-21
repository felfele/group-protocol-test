import { ImageData } from './ImageData';
import { HexString } from '../opaqueTypes';

type PostLink = string;

export interface PublicPost {
    _id?: string;
    images: ImageData[];
    text: string;
    createdAt: number;
}

export interface Post extends PublicPost {
    link?: string;
    updatedAt?: number;
    isUploading?: boolean;
    topic?: HexString;
}

export interface PostWithId extends Post {
    _id: HexString;
}

export interface PrivatePost extends PostWithId {
    topic: HexString;
}
