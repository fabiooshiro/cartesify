import { Utils } from "../utils";
import { FetchOptions } from "./FetchLikeClient";
import axios from "axios";
import { InputAddedListener } from "./InputAddedListener";
import { WrappedPromise } from "./WrappedPromise";
import { ContractTransactionResponse, ethers } from "ethers";
import { CartesiClient } from "..";

export class AxiosLikeClientV2 {

    private url: string | URL | globalThis.Request
    private options: any
    static requests: Record<string, WrappedPromise> = {}

    constructor(url: string | URL | globalThis.Request, options: any) {
        this.url = url
        this.options = options
    }

    async doRequestWithInspect() {
        if (!this.options?.cartesiClient) {
            throw new Error('You need to configure the Cartesi client')
        }
        const that = this.options.cartesiClient as any;
        const { logger } = that.config;

        try {
            const inputJSON = JSON.stringify({
                cartesify: {
                    axios: {
                        url: this.url,
                        options: { ...this.options, cartesiClient: undefined },
                    },
                },
            });
            const jsonEncoded = encodeURIComponent(inputJSON);
            const urlInner = new URL(that.config.endpoint);
            urlInner.pathname += `/${jsonEncoded}`;
            const response = await axios.get(urlInner.href, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            });
            const result: unknown = await response.data;

            if (Utils.isObject(result) && "reports" in result && Utils.isArrayNonNullable(result.reports)) {
                const lastReport = result.reports[result.reports.length - 1]
                if (Utils.isObject(lastReport) && "payload" in lastReport && typeof lastReport.payload === "string") {
                    const payload = Utils.hex2str(lastReport.payload.replace(/^0x/, ""));
                    const successOrError = JSON.parse(payload)
                    if (successOrError.success) {
                        return new AxiosResponse(successOrError.success)
                    } else if (successOrError.error) {
                        if (successOrError.error?.constructorName === "TypeError") {
                            throw new TypeError(successOrError.error.message)
                        } else {
                            throw successOrError.error
                        }
                    }
                }
            }
            throw new Error(`Wrong inspect response format.`)
        } catch (e) {
            logger.error(e);
            throw e;
        }

    }

    //     async doRequestWithAdvance(method: string, data: any) {
    //         if (!this.options.cartesiClient) {
    //             throw new Error('You need to configure the Cartesi client')
    //         }
    //         const cartesiClient = this.options.cartesiClient;
    //         const { logger } = cartesiClient.config;

    //         try {
    //             const { provider, signer } = cartesiClient.config;
    //             logger.info("getting network", provider);
    //             const network = await provider.getNetwork();
    //             logger.info("getting signer address", signer);
    //             const signerAddress = await signer.getAddress();
    //             logger.info(`connected to chain ${network.chainId}`);
    //             logger.info(`using account "${signerAddress}"`);

    //             // connect to rollup,
    //             const inputContract = await cartesiClient.getInputContract();

    //             // use message from command line option, or from user prompt
    //             logger.info(`sending "${JSON.stringify(this.options.body)}"`);

    //             const requestId = `${Date.now()}:${Math.random()}`
    //             const wPromise = AxiosLikeClientV2.requests[requestId] = new WrappedPromise()
    //             console.log("DATA::: ", data)
    //             console.log("OPTIONS::: ", this.options)
    //             const inputBytes = ethers.toUtf8Bytes(
    //                 JSON.stringify({
    //                     requestId,
    //                     cartesify: {
    //                         fetch: {
    //                             url: this.url,
    //                             options: { ...this.options, cartesiClient: undefined },
    //                         },
    //                     },
    //                 })
    //             );

    //             const dappAddress = await cartesiClient.getDappAddress();
    //             logger.info(`dappAddress: ${dappAddress} typeof ${typeof dappAddress}`);
    //             // send transaction
    //             const tx = await inputContract.addInput(dappAddress, inputBytes) as ContractTransactionResponse;
    //             logger.info(`transaction: ${tx.hash}`);
    //             logger.info("waiting for confirmation...");
    //             const receipt = await tx.wait(1);
    //             logger.info(JSON.stringify(receipt));
    //             return await wPromise.promise
    //         } catch (e) {
    //             logger.error(e);
    //             if (e instanceof Error) {
    //                 throw e;
    //             }
    //             throw new Error("Error on advance");
    //         }
    //     }
    // }

    async doRequestWithAdvance() {
        if (!this.options?.cartesiClient) {
            throw new Error('You need to configure the Cartesi client')
        }
        const cartesiClient = this.options.cartesiClient
        const { logger } = cartesiClient.config;
        try {
            new InputAddedListener(cartesiClient).addListener()
            const inputContract = await cartesiClient.getInputContract();
            const requestId = `${Date.now()}:${Math.random()}`
            const wPromise = InputAddedListener.requests[requestId] = new WrappedPromise()
            // convert string to input bytes (if it's not already bytes-like)
            const inputBytes = ethers.toUtf8Bytes(
                JSON.stringify({
                    requestId,
                    cartesify: {
                        fetch: {
                            url: this.url,
                            options: { ...this.options, cartesiClient: undefined },
                        },
                    },
                })
            );
            const dappAddress = await cartesiClient.getDappAddress();

            // send transaction
            const tx = await inputContract.addInput(dappAddress, inputBytes) as ContractTransactionResponse;
            await tx.wait(1);
            const resp = (await wPromise.promise) as any
            const res = new Response(resp.success)
            return res
        } catch (e) {
            logger.error(`Error ${this.options?.method ?? 'GET'} ${this.url}`, e)
            throw e
        }
    }
}




class AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: any;
    request?: any;

    constructor(params: {
        data: T;
        status: number;
        statusText: string;
        headers: Record<string, string>;
        config?: any;
        request?: any;
    }) {
        this.data = params.data;
        this.status = params.status;
        this.statusText = params.statusText || '';
        this.headers = params.headers || {};
        this.config = params.config || {};
        this.request = params.request;
    }

    async json() {
        if (typeof this.data === "string") {
            return JSON.parse(this.data);
        }
        return this.data;
    }

    async text() {
        return typeof this.data === "string" ? this.data : JSON.stringify(this.data);
    }
}
