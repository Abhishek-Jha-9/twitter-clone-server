"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const db_1 = require("../../clients/db");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const redis_1 = require("../../clients/db/redis");
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_DEFAULT_REGION,
});
const queries = {
    /* Get ALL Tweets*/
    getAllTweets: () => __awaiter(void 0, void 0, void 0, function* () {
        const cachedTweets = yield redis_1.RedisClient.get(`All_Tweets`);
        if (cachedTweets)
            return JSON.parse(cachedTweets);
        const tweets = yield db_1.prismaClient.tweet.findMany({
            orderBy: { createdAt: "desc" },
        });
        yield redis_1.RedisClient.setex(`All_Tweets`, 10, JSON.stringify(tweets));
        return tweets;
    }),
    /* Get AWS link for Uploading your Photo! */
    getSignedURLForTweet: (parent, { imageType, imageName }, ctx) => __awaiter(void 0, void 0, void 0, function* () {
        if (!ctx.user || !ctx.user.id)
            throw new Error("You must be unAunthenticated!");
        const allowedImageType = ["jpg", "png", "webp", "jpeg"];
        if (!allowedImageType.includes(imageType))
            throw new Error("Unsupported image type");
        const putObjectCommand = new client_s3_1.PutObjectCommand({
            Bucket: process.env.S3_BUCKET_NAME,
            Key: `uploads/${ctx.user.id}/tweets/${imageName}-${Date.now()}.${imageType}`,
        });
        const signedURL = yield (0, s3_request_presigner_1.getSignedUrl)(s3Client, putObjectCommand);
        return signedURL;
    }),
};
/* MUTATIONS*/
const mutations = {
    createTweet: (parent, { payload }, ctx) => __awaiter(void 0, void 0, void 0, function* () {
        if (!ctx.user)
            throw new Error("You must be authenticated");
        const rateLimitFlag = yield redis_1.RedisClient.get(`Rate_Limit_Tweet:${payload.userId}`);
        if (rateLimitFlag)
            throw new Error("Rate Limited. Please Wait...");
        const tweet = yield db_1.prismaClient.tweet.create({
            data: {
                content: payload.content,
                imageURL: payload.imageURL,
                author: {
                    connect: {
                        id: ctx.user.id,
                    },
                },
            },
        });
        yield redis_1.RedisClient.setex(`Rate_Limit_Tweet:${payload.userId}`, 5, 1);
        return tweet;
    }),
};
const extraResolvers = {
    Tweet: {
        author: (parent) => __awaiter(void 0, void 0, void 0, function* () {
            return yield db_1.prismaClient.user.findUnique({
                where: { id: parent.authorId },
            });
        }),
    },
};
exports.resolvers = { mutations, queries, extraResolvers };
