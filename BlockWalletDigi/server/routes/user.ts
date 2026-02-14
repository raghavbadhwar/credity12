import { Router } from "express";
import { storage } from "../storage";
import { insertUserSchema } from "@shared/schema";

const router = Router();

// Get current user profile
router.get("/user", async (req, res) => {
    // TODO: Get userId from session/auth
    const userId = 1;
    const user = await storage.getUser(userId);

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    res.json(user);
});

// Update user profile
router.patch("/user", async (req, res) => {
    try {
        // TODO: Get userId from session/auth
        const userId = 1;

        const parseResult = insertUserSchema.partial().safeParse(req.body);

        if (!parseResult.success) {
            return res.status(400).json({ message: "Invalid user data", errors: parseResult.error });
        }

        const updatedUser = await storage.updateUser(userId, parseResult.data);
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: "Internal Server Error" });
    }
});

// Get user activity
router.get("/activity", async (req, res) => {
    // TODO: Get userId from session/auth
    const userId = 1;
    const activities = await storage.listActivities(userId);
    res.json(activities);
});

export default router;
