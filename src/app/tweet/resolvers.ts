import { Tweet } from "@prisma/client";
import { prismaClient } from "../../clients/db";
import { GraphqlContext } from "../../interfaces";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { RedisClient } from "../../clients/db/redis";

interface CreateTweetPayload {
  userId: string;
  content: string;
  imageURL?: string;
}

const s3Client = new S3Client({
  region: process.env.AWS_DEFAULT_REGION,
});

const queries = {
  /* Get ALL Tweets*/

  getAllTweets: async () => {
    const cachedTweets = await RedisClient.get(`All_Tweets`);
    if (cachedTweets) return JSON.parse(cachedTweets);
    const tweets = await prismaClient.tweet.findMany({
      orderBy: { createdAt: "desc" },
    });
    await RedisClient.setex(`All_Tweets`, 10, JSON.stringify(tweets));
    return tweets;
  },

  /* Get AWS link for Uploading your Photo! */

  getSignedURLForTweet: async (
    parent: any,
    { imageType, imageName }: { imageType: string; imageName: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id)
      throw new Error("You must be unAunthenticated!");
    const allowedImageType = ["jpg", "png", "webp", "jpeg"];
    if (!allowedImageType.includes(imageType))
      throw new Error("Unsupported image type");

    const putObjectCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `uploads/${
        ctx.user.id
      }/tweets/${imageName}-${Date.now()}.${imageType}`,
    });
    const signedURL = await getSignedUrl(s3Client, putObjectCommand);
    return signedURL;
  },
};

/* MUTATIONS*/

const mutations = {
  createTweet: async (
    parent: any,
    { payload }: { payload: CreateTweetPayload },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user) throw new Error("You must be authenticated");
    const rateLimitFlag = await RedisClient.get(
      `Rate_Limit_Tweet:${payload.userId}`
    );
    if (rateLimitFlag) throw new Error("Rate Limited. Please Wait...");
    const tweet = await prismaClient.tweet.create({
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
    await RedisClient.setex(`Rate_Limit_Tweet:${payload.userId}`, 5, 1);
    return tweet;
  },
};

const extraResolvers = {
  Tweet: {
    author: async (parent: Tweet) => {
      return await prismaClient.user.findUnique({
        where: { id: parent.authorId },
      });
    },
  },
};

export const resolvers = { mutations, queries, extraResolvers };
