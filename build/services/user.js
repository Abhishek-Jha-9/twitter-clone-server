"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../clients/db");
class UserService {
    static followUser(from, to) {
        console.log(`Inside the followUser method of UserService from the server \n`);
        return db_1.prismaClient.follows.create({
            data: {
                followers: { connect: { id: from } },
                following: { connect: { id: to } },
            },
        });
    }
    static unfollowUser(from, to) {
        console.log(`Inside the unFollowUser method of UserService from the server \n`);
        return db_1.prismaClient.follows.delete({
            where: {
                followerId_followingId: { followerId: from, followingId: to },
            },
        });
    }
}
exports.default = UserService;
