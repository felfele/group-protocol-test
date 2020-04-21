import { Post } from './models/Post';
import { HexString } from './opaqueTypes';
import { serialize } from './serialization';
import { byteArrayToHex } from './conversion';
import { cryptoHash } from './crypto';

export const makePostId = (post: Post): HexString => {
    const publicPost = {
        text: post.text,
        createdAt: post.createdAt,
    };
    const postJSON = serialize(publicPost);
    return byteArrayToHex(cryptoHash(postJSON), false);
};
