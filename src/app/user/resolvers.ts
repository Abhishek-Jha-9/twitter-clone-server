import axios from "axios";
import { prismaClient } from "../../clients/db";
import JWTService from "../../services/jwt";
import { GraphqlContext } from "../../interfaces";
import { User } from "@prisma/client";
import UserService from "../../services/user";
import { RedisClient } from "../../clients/db/redis";

interface GoogleTokenResult {
  iss?: string;
  azp?: string;
  aud?: string;
  sub?: string;
  email: string;
  email_verified: string;
  nbf?: string;
  name?: string;
  picture?: string;
  given_name: string;
  family_name?: string;
  locale?: string;
  iat?: string;
  exp?: string;
  jti?: string;
  alg?: string;
  kid?: string;
  typ?: string;
}

const queries = {
  /* Verfying your Google Token */

  verifyGoogleToken: async (parent: any, { token }: { token: string }) => {
    // console.log(token);
    const googleToken = token;
    const googleOAuthURL = new URL("https://oauth2.googleapis.com/tokeninfo");
    googleOAuthURL.searchParams.set("id_token", googleToken);

    const { data } = await axios.get<GoogleTokenResult>(
      googleOAuthURL.toString(),
      {
        responseType: "json",
      }
    );
    console.log(data);
    const user = await prismaClient.user.findUnique({
      where: {
        email: data.email,
      },
    });
    if (!user) {
      await prismaClient.user.create({
        data: {
          email: data.email,
          firstName: data.given_name,
          lastName: data.family_name || "",
          profileImageURL: data.picture,
        },
      });
    }
    const userInDb = await prismaClient.user.findUnique({
      where: {
        email: data.email,
      },
    });

    if (!userInDb) throw new Error("User in Database not Found");

    const usertoken = JWTService.generateTokenForUser(userInDb);

    return usertoken;
  },

  /* Getting CurrentUser  */

  getCurrentUser: async (parent: any, args: any, ctx: GraphqlContext) => {
    const id = ctx.user?.id;
    // console.log("in console log of getcurrent user", ctx);
    if (!id) return null;

    const user = await prismaClient.user.findUnique({
      where: { id },
      include: {
        followers: true,
        following: true,
        tweets: true,
      },
    });
    // console.log("here in getCurrentUser--->\n", user);
    return user;
  },

  getUserById: async (
    parent: any,
    { id }: { id: string },
    ctx: GraphqlContext
  ) => {
    const resultUser = await prismaClient.user.findUnique({
      where: { id },
      include: {
        followers: true,
        following: true,

        tweets: true,
      },
    });
    // console.log("here in getUserById--->\n", resultUser);
    return resultUser;
  },
};

const extraResolvers = {
  User: {
    tweets: async (parent: User) =>
      await prismaClient.tweet.findMany({
        where: { author: { id: parent.id } },
      }),
    followers: async (parent: User) => {
      const result = await prismaClient.follows.findMany({
        where: { following: { id: parent.id } },
        include: {
          followers: true,
        },
      });
      // console.log(`in followers---->\n${result}`);
      return result.map((el) => el.followers);
    },
    following: async (parent: User) => {
      const result = await prismaClient.follows.findMany({
        where: { followers: { id: parent.id } },
        include: {
          followers: true,
          following: true,
        },
      });
      // console.log(`in following---->\n${result}`);
      return result.map((el) => el.following);
    },
    recommendedUsers: async (parent: User, _: any, ctx: GraphqlContext) => {
      if (!ctx.user) return [];

      const cachedUsers = await RedisClient.get(
        `Recommended_Users:${ctx.user.id}`
      );

      if (cachedUsers) return JSON.parse(cachedUsers);

      const myFollowings = await prismaClient.follows.findMany({
        where: {
          followers: { id: ctx.user.id },
        },
        include: {
          following: {
            include: { followers: { include: { following: true } } },
          },
        },
      });

      const recommendation: any[] = [];

      for (const followings of myFollowings) {
        for (const followingOfFollowedUsers of followings.following.followers) {
          if (
            followingOfFollowedUsers.following.id !== ctx.user.id &&
            myFollowings.findIndex(
              (e) => e?.following.id === followingOfFollowedUsers.following.id
            ) < 0
          ) {
            recommendation.push(followingOfFollowedUsers.following);
          }
        }
      }
      if (recommendation.length === 0) console.log("No recommendations");

      await RedisClient.set(
        `Recommended_Users:${ctx.user.id}`,
        JSON.stringify(recommendation)
      );

      return recommendation ? recommendation : [];
    },
  },
};

const mutations = {
  followUser: async (
    parent: any,
    { to }: { to: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) throw new Error("UnAuthenticated");
    await UserService.followUser(ctx.user.id, to);
    await RedisClient.del(`Recommended_Users:${ctx.user.id}`);
    return true;
  },
  unfollowUser: async (
    parent: any,
    { to }: { to: string },
    ctx: GraphqlContext
  ) => {
    if (!ctx.user || !ctx.user.id) throw new Error("UnAuthenticated");
    await UserService.unfollowUser(ctx.user.id, to);
    await RedisClient.del(`Recommended_Users:${ctx.user.id}`);
    return true;
  },
};

export const resolvers = { queries, extraResolvers, mutations };
