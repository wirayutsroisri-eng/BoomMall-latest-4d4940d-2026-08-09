import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getUserById, getPendingKycUsers, updateUser } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import { assertImageUploadSize } from "../uploadValidation";
import {
  isValidThaiPhone,
  normalizeThaiPhone,
  shippingAddressInputSchema,
  submitKycInputSchema,
} from "@shared/profile-validation";

export const kycRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    return {
      kycStatus: ctx.user.kycStatus,
      kycProvider: ctx.user.kycProvider,
      kycSocialName: ctx.user.kycSocialName,
      kycSocialEmail: ctx.user.kycSocialEmail,
      kycSubmittedAt: ctx.user.kycSubmittedAt,
      kycReviewedAt: ctx.user.kycReviewedAt,
      kycReviewNote: ctx.user.kycReviewNote,
      isSeller: ctx.user.isSeller,
    };
  }),

  // Submit KYC - simple form: full name + phone
  submitKyc: protectedProcedure
    .input(submitKycInputSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.kycStatus === "approved") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ยืนยันตัวตนแล้ว" });
      }

      // Auto-approve: ยืนยันตัวตนทันทีเมื่อกรอกเบอร์โทร
      await updateUser(ctx.user.id, {
        kycStatus: "approved",
        kycFullName: input.fullName ?? "-",
        kycPhone: input.phone,
        phone: input.phone,
        kycSubmittedAt: new Date(),
        kycReviewedAt: new Date(),
        isSeller: true,
      });

      return { success: true, message: "ยืนยันตัวตนสำเร็จแล้ว! เริ่มลงขายสินค้าได้เลย" };
    }),

  // Admin: list pending KYC
  adminListPending: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
    return getPendingKycUsers();
  }),

  // Admin: approve KYC
  adminApprove: protectedProcedure
    .input(z.object({ userId: z.number(), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      const user = await getUserById(input.userId);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      await updateUser(input.userId, {
        kycStatus: "approved",
        kycReviewedAt: new Date(),
        kycReviewNote: input.note,
        isSeller: true,
      });

      return { success: true };
    }),

  // Admin: reject KYC
  adminReject: protectedProcedure
    .input(z.object({ userId: z.number(), note: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });

      await updateUser(input.userId, {
        kycStatus: "rejected",
        kycReviewedAt: new Date(),
        kycReviewNote: input.note,
      });

      return { success: true };
    }),

  // Upload avatar
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        base64: z.string(), // base64 encoded image
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      console.log(`[uploadAvatar] userId=${ctx.user.id}, mimeType=${input.mimeType}, base64Length=${input.base64.length}`);
      // Decode base64 to buffer
      const base64Data = input.base64.replace(/^data:image\/[\w+]+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      console.log(`[uploadAvatar] buffer size=${buffer.length} bytes`);

      assertImageUploadSize(buffer, "รูปโปรไฟล์");

      const ext = input.mimeType.split("/")[1];
      const fileKey = `avatars/user-${ctx.user.id}-${Date.now()}.${ext}`;
      console.log(`[uploadAvatar] uploading to key=${fileKey}`);
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      console.log(`[uploadAvatar] uploaded, url=${url}`);

      await updateUser(ctx.user.id, { avatar: url });
      console.log(`[uploadAvatar] updateUser done for userId=${ctx.user.id}`);
      return { success: true, avatarUrl: url };
    }),

  // Update profile (contact info)
  updateProfile: protectedProcedure
    .input(
      z
        .object({
          phone: z.string().optional(),
          lineId: z.string().max(64).optional(),
          facebookUrl: z.string().max(255).optional(),
          province: z.string().max(100).optional(),
          address: z.string().max(500).optional(),
        })
        .superRefine((input, ctx) => {
          if (input.phone?.trim() && !isValidThaiPhone(input.phone)) {
            ctx.addIssue({
              code: "custom",
              message: "กรุณากรอกเบอร์โทรศัพท์ 10 หลัก (เช่น 0812345678)",
              path: ["phone"],
            });
          }
        })
    )
    .mutation(async ({ ctx, input }) => {
      const phone =
        input.phone?.trim() ? normalizeThaiPhone(input.phone) : null;
      await updateUser(ctx.user.id, {
        phone,
        lineId: input.lineId || null,
        facebookUrl: input.facebookUrl || null,
        province: input.province || null,
        address: input.address || null,
      });
      return { success: true };
    }),

  // Update shipping address
  updateShippingAddress: protectedProcedure
    .input(shippingAddressInputSchema)
    .mutation(async ({ ctx, input }) => {
      console.log(`[updateShippingAddress] userId=${ctx.user.id}, input=`, JSON.stringify(input));
      try {
        await updateUser(ctx.user.id, {
          shippingName: input.shippingName,
          shippingPhone: input.shippingPhone,
          shippingAddress: input.shippingAddress,
          shippingSubdistrict: input.shippingSubdistrict,
          shippingDistrict: input.shippingDistrict,
          shippingProvince: input.shippingProvince,
          shippingZipCode: input.shippingZipCode,
        });
        console.log(`[updateShippingAddress] SUCCESS for userId=${ctx.user.id}`);
      } catch (err) {
        console.error(`[updateShippingAddress] ERROR:`, err);
        throw err;
      }
      return { success: true };
    }),

  // Get shipping address — always query DB fresh (ctx.user is cached at login time)
  getShippingAddress: protectedProcedure.query(async ({ ctx }) => {
    const fresh = await getUserById(ctx.user.id);
    return {
      shippingName: fresh?.shippingName ?? "",
      shippingPhone: fresh?.shippingPhone ?? "",
      shippingAddress: fresh?.shippingAddress ?? "",
      shippingSubdistrict: fresh?.shippingSubdistrict ?? "",
      shippingDistrict: fresh?.shippingDistrict ?? "",
      shippingProvince: fresh?.shippingProvince ?? "",
      shippingZipCode: fresh?.shippingZipCode ?? "",
    };
  }),

    // Get default payment info
  getPaymentDefaults: protectedProcedure.query(async ({ ctx }) => {
    const fresh = await getUserById(ctx.user.id);
    return {
      bankName: fresh?.bankName ?? "",
      bankAccountNumber: fresh?.bankAccountNumber ?? "",
      bankAccountName: fresh?.bankAccountName ?? "",
      promptpayNumber: fresh?.promptpayNumber ?? "",
      defaultPromptpayQrUrl: fresh?.defaultPromptpayQrUrl ?? null,
      defaultPromptpayQrKey: fresh?.defaultPromptpayQrKey ?? null,
    };
  }),
  // Update default payment info
  updatePaymentDefaults: protectedProcedure
    .input(
      z.object({
        bankName: z.string().max(64).optional(),
        bankAccountNumber: z.string().max(20).optional(),
        bankAccountName: z.string().optional(),
        promptpayNumber: z.string().max(20).optional(),
        defaultPromptpayQrUrl: z.string().nullable().optional(),
        defaultPromptpayQrKey: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await updateUser(ctx.user.id, {
        bankName: input.bankName ?? null,
        bankAccountNumber: input.bankAccountNumber ?? null,
        bankAccountName: input.bankAccountName ?? null,
        promptpayNumber: input.promptpayNumber ?? null,
        defaultPromptpayQrUrl: input.defaultPromptpayQrUrl ?? null,
        defaultPromptpayQrKey: input.defaultPromptpayQrKey ?? null,
      });
      return { success: true };
    }),

  // Enable seller mode (after KYC approved)
  becomeSeller: protectedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.user.kycStatus !== "approved") {
        throw new TRPCError({ code: "FORBIDDEN", message: "กรุณายืนยันตัวตนก่อน" });
      }
      await updateUser(ctx.user.id, { isSeller: true });
      return { success: true };
    }),
});
