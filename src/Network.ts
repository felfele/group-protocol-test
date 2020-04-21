const clearTimeoutIfSet = (timeout: any) => {
    if (timeout != null) {
        clearTimeout(timeout);
    }
};

const timeoutFunction = async <T>(ms: number, promise: Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
        const timeout = ms > 0
            ? setTimeout(() => reject(new Error('timeout')), ms)
            : undefined
        ;
        promise.then((value) => {
            clearTimeoutIfSet(timeout);
            resolve(value);
        }, (reason) => {
            clearTimeoutIfSet(timeout);
            reject(reason);
        });
    });
}


export const safeFetch = async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
    const response = await fetch(input, init);
    if (!response.ok) {
        throw new Error('Network error: ' + response.status + ', text: ' + response.statusText + ', request: ' + input.toString());
    }
    return response;
};

export const safeFetchWithTimeout = async (input: RequestInfo, init?: RequestInit, timeout: number = 0): Promise<Response> => {
    return await timeoutFunction(timeout, safeFetch(input, init));
};
