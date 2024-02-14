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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = void 0;
const axios_1 = __importDefault(require("axios"));
const db_1 = require("../../clients/db");
const jwt_1 = __importDefault(require("../../services/jwt"));
const user_1 = __importDefault(require("../../services/user"));
const redis_1 = require("../../clients/db/redis");
const queries = {
    /* Verfying your Google Token */
    verifyGoogleToken: (parent, { token }) => __awaiter(void 0, void 0, void 0, function* () {
        // console.log(token);
        const googleToken = token;
        const googleOAuthURL = new URL("https://oauth2.googleapis.com/tokeninfo");
        googleOAuthURL.searchParams.set("id_token", googleToken);
        const { data } = yield axios_1.default.get(googleOAuthURL.toString(), {
            responseType: "json",
        });
        console.log(data);
        const user = yield db_1.prismaClient.user.findUnique({
            where: {
                email: data.email,
            },
        });
        if (!user) {
            yield db_1.prismaClient.user.create({
                data: {
                    email: data.email,
                    firstName: data.given_name,
                    lastName: data.family_name || "",
                    profileImageURL: data.picture,
                },
            });
        }
        const userInDb = yield db_1.prismaClient.user.findUnique({
            where: {
                email: data.email,
            },
        });
        if (!userInDb)
            throw new Error("User in Database not Found");
        const usertoken = jwt_1.default.generateTokenForUser(userInDb);
        return usertoken;
    }),
    /* Getting CurrentUser  */
    getCurrentUser: (parent, args, ctx) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const id = (_a = ctx.user) === null || _a === void 0 ? void 0 : _a.id;
        // console.log("in console log of getcurrent user", ctx);
        if (!id)
            return null;
        const user = yield db_1.prismaClient.user.findUnique({
            where: { id },
            include: {
                followers: true,
                following: true,
                tweets: true,
            },
        });
        // console.log("here in getCurrentUser--->\n", user);
        return user;
    }),
    getUserById: (parent, { id }, ctx) => __awaiter(void 0, void 0, void 0, function* () {
        const resultUser = yield db_1.prismaClient.user.findUnique({
            where: { id },
            include: {
                followers: true,
                following: true,
                tweets: true,
            },
        });
        // console.log("here in getUserById--->\n", resultUser);
        return resultUser;
    }),
};
const extraResolvers = {
    User: {
        tweets: (parent) => __awaiter(void 0, void 0, void 0, function* () {
            return yield db_1.prismaClient.tweet.findMany({
                where: { author: { id: parent.id } },
            });
        }),
        followers: (parent) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield db_1.prismaClient.follows.findMany({
                where: { following: { id: parent.id } },
                include: {
                    followers: true,
                },
            });
            // console.log(`in followers---->\n${result}`);
            return result.map((el) => el.followers);
        }),
        following: (parent) => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield db_1.prismaClient.follows.findMany({
                where: { followers: { id: parent.id } },
                include: {
                    followers: true,
                    following: true,
                },
            });
            // console.log(`in following---->\n${result}`);
            return result.map((el) => el.following);
        }),
        recommendedUsers: (parent, _, ctx) => __awaiter(void 0, void 0, void 0, function* () {
            if (!ctx.user)
                return [];
            const cachedUsers = yield redis_1.RedisClient.get(`Recommended_Users:${ctx.user.id}`);
            if (cachedUsers)
                return JSON.parse(cachedUsers);
            const myFollowings = yield db_1.prismaClient.follows.findMany({
                where: {
                    followers: { id: ctx.user.id },
                },
                include: {
                    following: {
                        include: { followers: { include: { following: true } } },
                    },
                },
            });
            const recommendation = [];
            for (const followings of myFollowings) {
                for (const followingOfFollowedUsers of followings.following.followers) {
                    if (followingOfFollowedUsers.following.id !== ctx.user.id &&
                        myFollowings.findIndex((e) => (e === null || e === void 0 ? void 0 : e.following.id) === followingOfFollowedUsers.following.id) < 0) {
                        recommendation.push(followingOfFollowedUsers.following);
                    }
                }
            }
            if (recommendation.length === 0)
                console.log("No recommendations");
            yield redis_1.RedisClient.set(`Recommended_Users:${ctx.user.id}`, JSON.stringify(recommendation));
            return recommendation ? recommendation : [];
        }),
    },
};
const mutations = {
    followUser: (parent, { to }, ctx) => __awaiter(void 0, void 0, void 0, function* () {
        if (!ctx.user || !ctx.user.id)
            throw new Error("UnAuthenticated");
        yield user_1.default.followUser(ctx.user.id, to);
        yield redis_1.RedisClient.del(`Recommended_Users:${ctx.user.id}`);
        return true;
    }),
    unfollowUser: (parent, { to }, ctx) => __awaiter(void 0, void 0, void 0, function* () {
        if (!ctx.user || !ctx.user.id)
            throw new Error("UnAuthenticated");
        yield user_1.default.unfollowUser(ctx.user.id, to);
        yield redis_1.RedisClient.del(`Recommended_Users:${ctx.user.id}`);
        return true;
    }),
};
exports.resolvers = { queries, extraResolvers, mutations };
