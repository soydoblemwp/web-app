import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(100),
  email: z.string().trim().email("Introduce un correo válido."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Introduce un correo válido."),
  password: z.string().min(1, "Introduce tu contraseña."),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  timezone: z.string().min(1).max(100),
  locale: z.string().min(2).max(10),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
