import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { imageBase64 } = await req.json();

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Identify the species of the bird in this image." },
            { type: "input_image", image_base64: imageBase64 },
          ],
        },
      ],
    });

    const speciesText = response.output_text || "Unknown";

    console.log("Identified species:", speciesText);

    return NextResponse.json({ species: speciesText });
  } catch (error) {
    console.error("Error identifying bird:", error);
    return NextResponse.json(
      { species: "Error", error: (error as any).message },
      { status: 500 }
    );
  }
}
