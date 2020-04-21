import { HexString } from './opaqueTypes';
import { PostWithId } from './models/Post';
import { Group } from './group';

interface PrivateChannelCommandBase {
    protocol: 'private';    // TODO this could be a hash to the actual protocol description
    version: 1;
}

export interface PrivateChannelCommandPost extends PrivateChannelCommandBase {
    type: 'post';
    post: PostWithId;
    version: 1;
}

export interface PrivateChannelCommandRemove extends PrivateChannelCommandBase {
    type: 'remove';
    version: 1;
    id: HexString;
}

export interface PrivateChannelCommandInviteToGroup extends PrivateChannelCommandBase {
    type: 'invite';
    version: 1;
    group: Group;
    logicalTime: number;
}

export type PrivateChannelCommand =
    | PrivateChannelCommandPost
    | PrivateChannelCommandRemove
    | PrivateChannelCommandInviteToGroup
;
