"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventType = exports.MessageSender = void 0;
var MessageSender;
(function (MessageSender) {
    MessageSender["HUMAN"] = "human";
    MessageSender["TWIN"] = "twin";
})(MessageSender || (exports.MessageSender = MessageSender = {}));
var EventType;
(function (EventType) {
    EventType["SIGNUP"] = "signup";
    EventType["TWIN_CREATED"] = "twin_created";
    EventType["CHAT_STARTED"] = "chat_started";
    EventType["DRAFT_GENERATED"] = "draft_generated";
    EventType["MESSAGE_APPROVED"] = "message_approved";
    EventType["PROFILE_SHARED"] = "profile_shared";
    EventType["INVITE_SENT"] = "invite_sent";
    EventType["INVITE_ACCEPTED"] = "invite_accepted";
})(EventType || (exports.EventType = EventType = {}));
//# sourceMappingURL=interfaces.js.map