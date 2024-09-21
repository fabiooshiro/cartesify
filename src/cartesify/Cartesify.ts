import { Signer } from "ethers";
import { CartesiClient, CartesiClientBuilder } from "..";
import { AxiosLikeClient } from "./AxiosLikeClient";
import { FetchFun, FetchOptions, fetch as _fetch } from "./FetchLikeClient";
import { Config, AxiosSetupOptions, DeleteConfig, AxiosClient } from "../models/config";
import { AxiosError } from "axios";
export class Cartesify {

    axios: AxiosLikeClient

    constructor(cartesiClient: CartesiClient) {
        this.axios = new AxiosLikeClient(cartesiClient)
    }

    static createFetch(options: AxiosSetupOptions): FetchFun {
        const builder = new CartesiClientBuilder()
            .withDappAddress(options.dappAddress)
            .withEndpoint(options.endpoints.inspect)
            .withEndpointGraphQL(options.endpoints.graphQL)
        if (options.provider) {
            builder.withProvider(options.provider)
        }
        const cartesiClient = builder.build()
        if (options.signer) {
            cartesiClient.setSigner(options.signer)
        }
        const fetchFun = function (input: string | URL | globalThis.Request, init?: FetchOptions) {
            if (init?.signer) {
                cartesiClient.setSigner(init.signer)
            }
            return _fetch(input, { ...init, cartesiClient })
        }
        fetchFun.setSigner = (signer: Signer) => {
            cartesiClient.setSigner(signer)
        }
        return fetchFun
    }

    static async axiosAdaptedUsingFetch(cFetch: FetchFun, method: string, url: string, data: any, init?: Config) {
        const requestHeaders = {
            "Content-Type": "application/json",
            ...init?.headers
        }
        const res = await cFetch(url, {
            method,
            headers: requestHeaders,
            body: data !== undefined ? JSON.stringify(data) : undefined
        }).catch(e => e)
        if (res instanceof TypeError && (res.cause as any)?.code === "ECONNREFUSED") {
            const cause = res.cause as any
            throw new AxiosError(`${cause.syscall} ${cause.code} ${cause.address}:${cause.port}`)
        }
        if (!res.ok) {
            const error = new AxiosError(`Request failed with status code ${res.status}`)
            error.response = {
                status: res.status
            } as any
            throw error
        }
        const responseHeaders = Object.fromEntries(res.headers)
        return {
            statusText: 'ok',
            data: await res.json(),
            headers: responseHeaders,
            config: {
                headers: requestHeaders
            }
        }
    }

    static createAxios(options: AxiosSetupOptions): AxiosClient {
        const cFetch = Cartesify.createFetch(options)

        return {
            get: (url: string, init?: Config) => {
                return Cartesify.axiosAdaptedUsingFetch(cFetch, "GET", url, undefined, init)
            },
            post: async (url: string, data?: Record<string, any>, init?: Config) => {
                return Cartesify.axiosAdaptedUsingFetch(cFetch, "POST", url, data, init)
            },
            put: (url: string, data?: Record<string, any>, init?: Config) => {
                return Cartesify.axiosAdaptedUsingFetch(cFetch, "PUT", url, data, init)
            },
            patch: (url: string, data?: Record<string, any>, init?: Config) => {
                return Cartesify.axiosAdaptedUsingFetch(cFetch, "PATCH", url, data, init)
            },
            delete: (url: string, init?: DeleteConfig) => {
                return Cartesify.axiosAdaptedUsingFetch(cFetch, "DELETE", url, undefined, init)
            }
        };
    }
}
