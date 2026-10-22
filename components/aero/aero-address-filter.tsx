"use client";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TRACKED_ADDRESSES } from "@/lib/aero/constants";

export function AeroAddressFilter({ selected }: { selected: string }) {
  const router = useRouter();
  const selectedLabel = TRACKED_ADDRESSES.find(
    (a) => a.address === selected.toLowerCase()
  )?.label ?? selected;
  return (
    <Select
      value={selected.toLowerCase()}
      onValueChange={(val) => router.push(`/aero?address=${val}`)}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TRACKED_ADDRESSES.map((a) => (
          <SelectItem key={a.address} value={a.address}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
