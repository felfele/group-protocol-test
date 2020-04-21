import { Post, PostWithId } from './models/Post'
import { HexString } from './opaqueTypes'
import { ImageData } from './models/ImageData'
import {
    ChapterReference,
    makePartialChapter,
    Timeline,
    PartialChapter,
    uploadTimeline,
    fetchTimeline,
    getNewestChapterId,
} from './timeline'
import { ProtocolStorage } from './ProtocolStorage'
import { ProtocolCrypto } from './ProtocolCrypto'
import { serialize, deserialize } from './serialization'
import { stringToUint8Array, hexToUint8Array, Uint8ArrayToString } from './conversion'

export interface PeerSyncData {
    address: HexString
    peerLastSeenChapterId: ChapterReference | undefined
}

interface PeerSyncDataUpdate extends GroupSyncPeer {
    timeline: Timeline<GroupCommand>
}

export interface OwnSyncData {
    ownAddress: HexString
    unsyncedCommands: GroupCommand[]
    lastSyncedChapterId: ChapterReference | undefined
    logicalTime: number
    joinLogicalTime: number
}

interface OwnSyncDataUpdate extends OwnSyncData {
    timeline: Timeline<GroupCommand>
}

export interface GroupPeer {
    publicKey?: HexString | undefined
    address: HexString
    name: string
    image: ImageData
    joinLogicalTime: number
}

export interface GroupSyncPeer extends GroupPeer, PeerSyncData {
}

export interface Group {
    sharedSecret: HexString
    topic: HexString
    peers: GroupSyncPeer[]
}

export interface GroupSyncData extends Group {
    ownSyncData: OwnSyncData
}

interface GroupSyncUpdate extends Group {
    ownSyncDataUpdate: OwnSyncDataUpdate
    peerSyncDataUpdates: PeerSyncDataUpdate[]
}

interface GroupCommandBase {
    protocol: 'group'
    version: 1
    logicalTime: number
}

export interface GroupCommandAddMember extends GroupCommandBase {
    type: 'add-member'

    member: GroupPeer
}

export interface GroupCommandRemoveMember extends GroupCommandBase {
    type: 'remove-member'

    address: HexString
}

export interface GroupCommandPost extends GroupCommandBase {
    type: 'post'

    post: PostWithId
}

export interface GroupCommandRemovePost extends GroupCommandBase {
    type: 'remove-post'

    id: HexString
}

export type GroupCommand =
    | GroupCommandAddMember
    | GroupCommandRemoveMember
    | GroupCommandPost
    | GroupCommandRemovePost


const groupAppendCommand = (syncData: OwnSyncData, command: GroupCommand): OwnSyncData => {
    return {
        ...syncData,
        logicalTime: command.logicalTime,
        unsyncedCommands: [command, ...syncData.unsyncedCommands],
    }
}

const makeGroupCommandBase = (syncData: OwnSyncData): GroupCommandBase => ({
    protocol: 'group',
    version: 1,
    logicalTime: syncData.logicalTime + 1,
})

export const groupAddMember = (syncData: OwnSyncData, member: GroupPeer): OwnSyncData => {
    const command: GroupCommandAddMember = {
        ...makeGroupCommandBase(syncData),
        type: 'add-member',
        member,
    }
    return groupAppendCommand(syncData, command)
}

export const groupRemoveMember = (syncData: OwnSyncData, address: HexString): OwnSyncData => {
    const command: GroupCommandRemoveMember = {
        ...makeGroupCommandBase(syncData),
        type: 'remove-member',
        address,
    }
    return groupAppendCommand(syncData, command)
}

export const groupPost = (syncData: OwnSyncData, post: PostWithId): OwnSyncData => {
    const command: GroupCommandPost = {
        ...makeGroupCommandBase(syncData),
        type: 'post',
        post,
    }
    return groupAppendCommand(syncData, command)
}

export const groupRemovePost = (syncData: OwnSyncData, id: HexString): OwnSyncData => {
    const command: GroupCommandRemovePost = {
        ...makeGroupCommandBase(syncData),
        type: 'remove-post',
        id,
    }
    return groupAppendCommand(syncData, command)
}

const uploadImages = async (
    images: ImageData[],
    uploadImage: (image: ImageData) => Promise<ImageData>,
): Promise<ImageData[]> => {
    const uploadedImages = []
    for (const image of images) {
        const uploadedImage = await uploadImage(image)
        uploadedImages.push(uploadedImage)
    }
    return uploadedImages
}

const uploadAddPostImages = async (
    post: PostWithId,
    uploadImage: (image: ImageData) => Promise<ImageData>,
): Promise<PostWithId> => {
    return {
        ...post,
        images: await uploadImages(post.images, uploadImage),
    }
}

const uploadUnsyncedTimeline = async (
    unsyncedTimeline: Timeline<GroupCommand>,
    lastSyncedChapterId: ChapterReference | undefined,
    address: HexString,
    topic: HexString,
    sharedSecret: HexString,
    storage: ProtocolStorage,
    crypto: ProtocolCrypto,
    uploadImage: (image: ImageData) => Promise<ImageData>,
): Promise<Timeline<GroupCommand>> => {
    const encryptChapter = async (c: PartialChapter<GroupCommand>): Promise<Uint8Array> => {
        const s = serialize(c)
        const dataBytes = stringToUint8Array(s)
        const secretBytes = hexToUint8Array(sharedSecret)
        const random = await crypto.random(32)
        return crypto.encrypt(dataBytes, secretBytes, random)
    }

    if (unsyncedTimeline.length === 0) {
        return []
    }

    const imageSyncedTimeline: Timeline<GroupCommand> = []
    for (const chapter of unsyncedTimeline) {
        const imageSyncedChapter = chapter.content.type === 'post'
            ? {
                ...chapter,
                content: {
                    ...chapter.content,
                    post: await uploadAddPostImages(chapter.content.post, uploadImage),
                },
            }
            : chapter

        imageSyncedTimeline.push(imageSyncedChapter)
    }

    const syncedTimeline = await uploadTimeline(
        imageSyncedTimeline,
        storage,
        address,
        topic,
        encryptChapter,
        crypto.signDigest,
        lastSyncedChapterId,
    )
    return syncedTimeline
}

const fetchPeerTimeline = async (
    peerLastSeenChapterId: ChapterReference | undefined,
    address: HexString,
    topic: HexString,
    sharedSecret: HexString,
    storage: ProtocolStorage,
    crypto: ProtocolCrypto,
): Promise<Timeline<GroupCommand>> => {
    const decryptChapter = (dataBytes: Uint8Array): PartialChapter<GroupCommand> => {
        const secretBytes = hexToUint8Array(sharedSecret)
        const decryptedBytes = crypto.decrypt(dataBytes, secretBytes)
        const decryptedText = Uint8ArrayToString(decryptedBytes)
        return deserialize(decryptedText) as PartialChapter<GroupCommand>
    }

    const peerTimeline = await fetchTimeline(storage, address, topic, decryptChapter, peerLastSeenChapterId)
    return peerTimeline
}

const fetchPeerTimelines = async (
    peers: GroupSyncPeer[],
    topic: HexString,
    sharedSecret: HexString,
    storage: ProtocolStorage,
    crypto: ProtocolCrypto,
): Promise<(PeerSyncDataUpdate)[]> => {
    const fetchAndReturnPeerWithTimeline = async (peer: GroupSyncPeer) => ({
        ...peer,
        timeline: await fetchPeerTimeline(
            peer.peerLastSeenChapterId,
            peer.address,
            topic,
            sharedSecret,
            storage,
            crypto,
        ),
    })
    const peerTimelinePromises = peers.map(fetchAndReturnPeerWithTimeline)
    return Promise.all(peerTimelinePromises)
}

export const groupSync = async (
    group: GroupSyncData,
    storage: ProtocolStorage,
    crypto: ProtocolCrypto,
    uploadImage: (image: ImageData) => Promise<ImageData>,
): Promise<GroupSyncUpdate> => {

    try {
        const unsyncedTimeline = group.ownSyncData.unsyncedCommands.map(command =>
            makePartialChapter(group.ownSyncData.ownAddress, command, Date.now())
        )

        const syncedLocalTimeline = await uploadUnsyncedTimeline(
            unsyncedTimeline,
            group.ownSyncData.lastSyncedChapterId,
            group.ownSyncData.ownAddress,
            group.topic,
            group.sharedSecret,
            storage,
            crypto,
            uploadImage,
        )

        console.log('groupSync', {peers: group.peers})
        const peerSyncDataUpdates = await fetchPeerTimelines(
            group.peers,
            group.topic,
            group.sharedSecret,
            storage,
            crypto,
        )

        return {
            ...group,
            ownSyncDataUpdate: {
                ...group.ownSyncData,
                timeline: syncedLocalTimeline,
            },
            peerSyncDataUpdates,
        }
    } catch (e) {
        return {
            ...group,
            ownSyncDataUpdate: {
                ...group.ownSyncData,
                timeline: [],
            },
            peerSyncDataUpdates: group.peers.map(member => ({
                ...member,
                timeline: [],
            })),
        }
    }
}

export const groupListMembers = (peers: GroupPeer[], ownSyncData: OwnSyncData): HexString[] => {
    const peerAdresses = peers.map(peer => ({
        address: peer.address,
        joinLogicalTime: peer.joinLogicalTime,
    }))
    return peerAdresses
        .concat([{
            address: ownSyncData.ownAddress,
            joinLogicalTime: ownSyncData.joinLogicalTime,
        }])
        .sort((a, b) => a.joinLogicalTime - b.joinLogicalTime)
        .map(pa => pa.address)

}

const reverseMap = <T, K>(arr: T[], fun: (t: T) => K): K[] =>
    arr.map((_, index) => fun(arr[arr.length - 1 - index]))


export const groupApplySyncUpdate = (
    update: GroupSyncUpdate,
    executeRemoteCommand?: (command: GroupCommand, address: HexString) => void,
    executeLocalCommand?: (command: GroupCommand) => void,
): GroupSyncData => {
    if (executeLocalCommand != null) {
        reverseMap(update.ownSyncDataUpdate.timeline, chapter => executeLocalCommand(chapter.content))
    }

    const ownSyncData: OwnSyncData = {
        ...update.ownSyncDataUpdate,
        unsyncedCommands: update.ownSyncDataUpdate.timeline.length !== 0
            ? []
            : update.ownSyncDataUpdate.unsyncedCommands
        ,
        lastSyncedChapterId: update.ownSyncDataUpdate.timeline.length !== 0
            ? getNewestChapterId(update.ownSyncDataUpdate.timeline)
            : update.ownSyncDataUpdate.lastSyncedChapterId
        ,
    }

    const addedMembers: PeerSyncDataUpdate[] = []
    const removedMembers: HexString[] = []
    let highestSeenLogicalTime = ownSyncData.logicalTime
    update.peerSyncDataUpdates.map(peerSyncUpdate => {
        reverseMap(peerSyncUpdate.timeline, chapter => {
            const command = chapter.content
            if (executeRemoteCommand != null) {
                executeRemoteCommand(command, peerSyncUpdate.address)
            }
            if (command.logicalTime > highestSeenLogicalTime) {
                highestSeenLogicalTime = command.logicalTime
            }
            switch (command.type) {
                case 'add-member': {
                    if (command.member.address === update.ownSyncDataUpdate.ownAddress) {
                        return
                    }
                    const index = update.peers.findIndex(peer => peer.address === command.member.address)
                    if (index !== -1) {
                        return
                    }
                    addedMembers.push({
                        ...command.member,
                        peerLastSeenChapterId: undefined,
                        joinLogicalTime: command.logicalTime,
                        timeline: [],
                    })
                    return
                }
                case 'remove-member': {
                    if (command.address !== groupListMembers(update.peers, update.ownSyncDataUpdate)[0]) {
                        return
                    }
                    removedMembers.push(command.address)
                    return
                }
            }
        })
    })
    if (removedMembers.includes(update.ownSyncDataUpdate.ownAddress)) {
        return {
            topic: '' as HexString,
            sharedSecret: '' as HexString,
            peers: [],
            ownSyncData,
        }
    }
    const peerSyncDataUpdates = update.peerSyncDataUpdates
        .filter(peerSyncUpdate => removedMembers.includes(peerSyncUpdate.address) === false)
        .concat(addedMembers)

    const members: GroupSyncPeer[] = peerSyncDataUpdates.map(peerSyncUpdate => ({
        ...peerSyncUpdate,
        address: peerSyncUpdate.address,
        peerLastSeenChapterId: peerSyncUpdate.timeline.length !== 0
            ? getNewestChapterId(peerSyncUpdate.timeline)
            : peerSyncUpdate.peerLastSeenChapterId
        ,
    }))
    return {
        ...update,
        ownSyncData: {
            ...ownSyncData,
            logicalTime: highestSeenLogicalTime,
        },
        peers: members,
    }
}
