import { Debug } from './Debug';
import { HexString } from './opaqueTypes';
import { ProtocolStorage, ProtocolStorageFeeds } from './ProtocolStorage';
import * as Swarm from './Swarm';

const addPrefixToTopic = (topic: HexString): HexString => {
    return topic.startsWith('0x')
        ? topic
        : ('0x' + topic) as HexString
    ;
};

export class SwarmStorageFeeds implements ProtocolStorageFeeds {
    public constructor(readonly swarmFeedApi: Swarm.FeedApi) {}

    public write = async (address: HexString, topic: HexString, data: string, signFeedDigest: Swarm.FeedDigestSigner = this.swarmFeedApi.signFeedDigest) => {
        const prefixedTopic = addPrefixToTopic(topic);
        const feedAddress: Swarm.FeedAddress = {
            user: address,
            topic: prefixedTopic,
        };
        const feed = Swarm.makeFeedApi(feedAddress, signFeedDigest, this.swarmFeedApi.swarmGateway);
        await feed.update(data);
    }

    public read = async (address: HexString, topic: HexString) => {
        const prefixedTopic = addPrefixToTopic(topic);
        const feedAddress: Swarm.FeedAddress = {
            user: address,
            topic: prefixedTopic,
        };
        const feed = Swarm.makeReadableFeedApi(feedAddress, this.swarmFeedApi.swarmGateway);
        try {
            const data = await feed.download(0);
            return data;
        } catch (e) {
            throw new Error(`cannot read data from feed: ${feedAddress.user} ${feedAddress.topic}`);
        }
    }
}

export class SwarmStorage implements ProtocolStorage {
    public readonly feeds = new SwarmStorageFeeds(this.swarm.feed);

    public constructor(readonly swarm: Swarm.Api) {}

    public write = async (data: Uint8Array): Promise<HexString> => {
        const hash = await this.swarm.bzz.uploadUint8Array(data) as HexString;
        return hash;
    }

    public read = async (hash: HexString): Promise<Uint8Array> => {
        const data = await this.swarm.bzz.downloadUint8Array(hash, 0);
        return data;
    }
}
