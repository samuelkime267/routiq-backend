import { FRONTEND_URL, PORT } from "@/config/env";
import { UserDocument } from "@/models/user.model";
import { CustomError } from "@/types";
import { generateJwtToken, refreshTokenCookieOptions } from "@/utils";
import { NextFunction, Request, Response } from "express";
import passport from "passport";

/* This is for new tab pop up */
export const googleOAuthCallback = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  passport.authenticate(
    "google",
    { session: false },
    (err: CustomError, user: UserDocument, info) => {
      if (err || !user) {
        return res.send(`
          <html>
            <body>
              <script>
                window.opener.postMessage({ 
                  status: 'error',
                  message: '${err?.message || "Authentication failed"}',
                  statusCode: ${err?.statusCode || 400}, 
                  success: false,
                  from:"oauth",
                  error: ${JSON.stringify(err)}
                  },
                  '${FRONTEND_URL}'
                );
                window.close();
              </script>
              <p>Authentication failed. You can close this tab.</p>
            </body>
          </html>
        `);
      }

      const token = generateJwtToken(user._id);
      return res.cookie("refreshToken", token.refreshToken, refreshTokenCookieOptions).send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({
                  status: 'success',
                  from:"oauth",
                  success:true
                },
                '${FRONTEND_URL}'
              );
              window.close();
            </script>
          </body>
        </html>
      `);
    },
  )(req, res, next);
};

/* This is if you're using the same tab for everything */
// import { FRONTEND_URL } from "@/config/env";
// import { UserDocument } from "@/models/user.model";
// import { generateJwtToken } from "@/utils";
// import { NextFunction, Request, Response } from "express";

// export const googleOAuthCallback = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   const user = req.user as UserDocument;
//   const token = generateJwtToken(user._id);

//   res
//     .cookie("refreshToken", token.refreshToken, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//       sameSite: "strict",
//       maxAge: 30 * 24 * 60 * 60 * 1000,
//       path: "/api/v1/auth",
//     })
//     .redirect(`${FRONTEND_URL}/auth/login?provider=google`);
// };
