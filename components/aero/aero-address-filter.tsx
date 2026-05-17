"use client";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TRACKED_ADDRESSES = [
  { address: "0xf142022273602c6a6c0ea7a044d21082273bd686", label: "mykclawd" },
  { address: "0xfac5f38f795bc4f39950cca8527eea00d5bb0ef7", label: "wishlist.holiday" },
  { address: "0x4d63da43f74e864f069f908465f2f3f13977976e", label: "yield.myk.eth" },
] as const;

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
