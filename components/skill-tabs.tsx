"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

interface SkillFile {
  label: string;
  value: string;
  html: string;
}

interface SkillTabsProps {
  installPrompt: string;
  files: SkillFile[];
}

export function SkillTabs({ installPrompt, files }: SkillTabsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(installPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border/60 bg-muted/40 p-4 flex flex-col gap-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Install prompt
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-foreground break-all">
            {installPrompt}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="shrink-0 gap-1.5"
          >
            {copied ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue={files[0]?.value}>
        <TabsList>
          {files.map((f) => (
            <TabsTrigger key={f.value} value={f.value}>
              {f.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {files.map((f) => (
          <TabsContent key={f.value} value={f.value}>
            <div
              className="prose-skill rounded-lg border border-border/60 bg-card p-5 mt-2"
              dangerouslySetInnerHTML={{ __html: f.html }}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
